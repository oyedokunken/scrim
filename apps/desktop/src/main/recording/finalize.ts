import {
  inputLogFileName,
  parseBoundsNdjson,
  parseInputNdjson,
  playableTrackFile,
  sessionLogSchema,
  SESSION_FILES,
  toMediaTime,
  toSessionLog,
  type Pause,
  type SessionFile,
} from '@scrim/core';
import { join } from 'node:path';
import { probeFile, remuxTrack, type FfmpegPaths, type RunProcess } from './ffmpeg';
import type { ServiceFs } from './fs-adapter';
import { makeError } from './messages';
import { ensureEditList, writeSession } from './session-store';
import type { FinishedRecording, Outcome } from './types';

/**
 * How long after something happens the video shows it, in milliseconds. Measured with the on screen
 * marker over six runs on Windows, now that every video track's time zero is exact: the video shows
 * a flip 37 to 89 ms after the page drew it, run medians averaging 68. That is the screen being
 * composed and captured, which no timestamp removes. The log adds it to every event, so a halo
 * drawn at an event's time sits on the frame where the real cursor and the page react. The marker
 * goes through the page compositor, which the cursor does not, so for the cursor alone this is
 * probably a little high.
 */
const DISPLAY_LATENCY_MS = 68;

export interface FinalizeDeps {
  fs: ServiceFs;
  run: RunProcess;
  paths: FfmpegPaths;
  log: (message: string) => void;
}

export interface FinalizeInput {
  folder: string;
  session: SessionFile;
  /** The main clock when the recording ended, in milliseconds. */
  endMs: number;
  /** True when this is recovery after a crash. */
  recovered: boolean;
}

/** Closes a pause that is still open at `at`, as when a recording stops while paused or crashes. */
function closeOpenPause(pauses: readonly Pause[], at: number): Pause[] {
  return pauses.map((pause) =>
    pause.resumedAt === null
      ? { pausedAt: pause.pausedAt, resumedAt: Math.max(at, pause.pausedAt) }
      : pause,
  );
}

/**
 * Turns what is on disk into a finished recording. Each raw track is remuxed into a playable file
 * with `-c copy` and checked, the mouse log is converted to the saved log and checked, and only
 * then is the session marked as cleanly closed. Raw files are only read. The same steps serve a
 * normal stop and recovery, because a recovered recording is just a stop that happened late.
 *
 * Any step that fails leaves `cleanClose` false, so the recording is offered for recovery again
 * and nothing is lost, and says which step failed.
 */
export async function finalizeSession(
  deps: FinalizeDeps,
  input: FinalizeInput,
): Promise<Outcome<{ session: SessionFile; result: FinishedRecording }>> {
  const { fs, run, paths, log } = deps;
  const { folder, endMs, recovered } = input;
  const pauses = closeOpenPause(input.session.pauses, endMs);
  const warnings = [...input.session.warnings];

  // What is really on disk is the truth, whatever the last heartbeat said.
  const sized = await Promise.all(
    input.session.tracks.map(async (track) => ({
      track,
      size: await fs.fileSize(join(folder, track.file)),
    })),
  );
  const present = sized.filter((entry) => (entry.size ?? 0) > 0);
  if (!present.some((entry) => entry.track.kind === 'screen')) {
    return { ok: false, error: makeError('nothing-recoverable') };
  }

  const tracks: SessionFile['tracks'] = [];
  let screenProbe: { width?: number | undefined; height?: number | undefined } | undefined;
  for (const { track, size } of sized) {
    // A track that never reported a stop, as after a crash, is taken to have run to the end.
    const stoppedAt = track.stoppedAt ?? endMs;
    if ((size ?? 0) === 0) {
      tracks.push({ ...track, stoppedAt, complete: true });
      continue;
    }
    const playable = playableTrackFile(track.kind, track.mimeType);
    const result = await remuxTrack({
      run,
      paths,
      raw: join(folder, track.file),
      output: join(folder, playable),
      temp: join(folder, playable.replace(/(\.[a-z0-9]+)$/i, '.tmp$1')),
      rename: (from, to) => fs.rename(from, to),
      remove: (path) => fs.remove(path),
      requireVideo: track.kind !== 'mic',
    });
    if (!result.ok) {
      log(`Remux of ${track.file} failed: ${result.reason}: ${result.detail}`);
      if (result.reason === 'ffmpeg-missing')
        return { ok: false, error: makeError('ffmpeg-missing') };
      if (track.kind === 'screen') {
        return { ok: false, error: makeError('remux-failed', result.detail) };
      }
      warnings.push(`The ${track.kind} recording could not be made playable.`);
      tracks.push({
        ...track,
        stoppedAt,
        bytesWritten: size ?? track.bytesWritten,
        complete: true,
      });
      continue;
    }
    if (track.kind === 'screen') screenProbe = result.probe;
    tracks.push({
      ...track,
      stoppedAt,
      bytesWritten: size ?? track.bytesWritten,
      complete: true,
      playableFile: playable,
    });
  }

  let inputLog: string | undefined;
  if (input.session.input.status === 'recorded') {
    const converted = await convertInputLog(deps, {
      folder,
      session: input.session,
      pauses,
      frame: screenProbe,
    });
    if (converted.ok) inputLog = converted.value;
    else {
      log(`The input log was not converted: ${converted.error.detail ?? converted.error.message}`);
      return converted;
    }
  }

  await ensureEditList(fs, folder);
  const session: SessionFile = {
    ...input.session,
    tracks,
    pauses,
    warnings,
    heartbeatAt: new Date().toISOString(),
    heartbeatElapsedMs: endMs,
    cleanClose: true,
    ...(recovered ? { recovered: true } : {}),
  };
  await writeSession(fs, folder, session);

  const screen = tracks.find((track) => track.kind === 'screen');
  const start = screen?.startedAt ?? 0;
  return {
    ok: true,
    value: {
      session,
      result: {
        folder,
        name: session.name,
        files: tracks.flatMap((track) =>
          track.playableFile === undefined
            ? []
            : [{ kind: track.kind, path: join(folder, track.playableFile) }],
        ),
        durationMs: Math.round(toMediaTime(endMs, start, pauses)),
        bytes: tracks.reduce((sum, track) => sum + track.bytesWritten, 0),
        inputLog,
        recovered,
        warnings,
      },
    },
  };
}

async function convertInputLog(
  deps: FinalizeDeps,
  input: {
    folder: string;
    session: SessionFile;
    pauses: readonly Pause[];
    frame: { width?: number | undefined; height?: number | undefined } | undefined;
  },
): Promise<Outcome<string | undefined>> {
  const { fs, run, paths } = deps;
  const { folder, session } = input;
  const rawPath = join(folder, SESSION_FILES.input);
  if ((await fs.fileSize(rawPath)) === undefined) return { ok: true, value: undefined };

  const screen = session.tracks.find((track) => track.kind === 'screen');
  let frame = input.frame;
  if (frame?.width === undefined || frame.height === undefined) {
    frame = session.source.frame ?? (await probeFrame(run, paths, folder, session));
  }
  if (frame?.width === undefined || frame.height === undefined) {
    return { ok: false, error: makeError('remux-failed', 'The video size is not known.') };
  }

  const boundsPath = join(folder, SESSION_FILES.windowBounds);
  const windowBounds =
    session.windowBounds?.status === 'recorded' && (await fs.fileSize(boundsPath)) !== undefined
      ? parseBoundsNdjson(await fs.readText(boundsPath))
      : undefined;
  const parsed = parseInputNdjson(await fs.readText(rawPath));
  const log = toSessionLog(parsed.events, {
    windowBounds,
    latencyMs: DISPLAY_LATENCY_MS,
    startTime: screen?.startedAt ?? 0,
    pauses: input.pauses,
    frame: { width: frame.width, height: frame.height },
    origin: session.source.origin,
    scale: session.source.scaleFactor,
  });
  if (!log.ok) return { ok: false, error: makeError('unknown', log.error.message) };

  const name = inputLogFileName(session.name);
  const target = join(folder, name);
  await fs.writeJsonAtomic(target, log.value);
  // Verified by reading it back, and only then is the raw log removed.
  const check = sessionLogSchema.safeParse(JSON.parse(await fs.readText(target)));
  if (!check.success || check.data.events.length !== log.value.events.length) {
    return { ok: false, error: makeError('unknown', 'The saved input log did not verify.') };
  }
  await fs.remove(rawPath);
  if (windowBounds !== undefined) await fs.remove(boundsPath);
  return { ok: true, value: target };
}

async function probeFrame(
  run: RunProcess,
  paths: FfmpegPaths,
  folder: string,
  session: SessionFile,
): Promise<{ width: number; height: number } | undefined> {
  const screen = session.tracks.find((track) => track.kind === 'screen');
  if (screen === undefined) return undefined;
  const probe = await probeFile(run, paths, join(folder, screen.file));
  return probe?.width !== undefined && probe.height !== undefined
    ? { width: probe.width, height: probe.height }
    : undefined;
}
