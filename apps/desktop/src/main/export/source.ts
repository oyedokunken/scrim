import {
  editListSchema,
  emptyEditList,
  inputLogFileName,
  sessionFileSchema,
  sessionLogSchema,
  SESSION_FILES,
} from '@scrim/core';
import type { EditList, SessionFile, SessionLog, TrackKind } from '@scrim/core';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface ExportSource {
  /** The session with every time counted from the first screen frame, which is what the log uses. */
  session: SessionFile;
  log: SessionLog | null;
  edits: EditList;
  /** The file to decode for each track, playable copy first. */
  files: Partial<Record<TrackKind, string>>;
}

export type LoadSourceResult =
  { ok: true; source: ExportSource } | { ok: false; reason: 'missing' | 'invalid' | 'no-screen' };

/**
 * The mouse log, the zoom plan and the camera bubble all count time from the first screen frame,
 * while the session file counts from the moment the recording was requested. This moves every
 * time in the session to the first. Nothing is written back.
 */
export function rebaseSession(session: SessionFile): SessionFile {
  const base = session.tracks.find((track) => track.kind === 'screen')?.startedAt ?? 0;
  const shift = (value: number): number => Math.max(0, value - base);
  return {
    ...session,
    tracks: session.tracks.map((track) => ({
      ...track,
      startedAt: shift(track.startedAt),
      ...(track.stoppedAt === undefined ? {} : { stoppedAt: shift(track.stoppedAt) }),
    })),
    pauses: session.pauses.map((pause) => ({
      pausedAt: shift(pause.pausedAt),
      resumedAt: pause.resumedAt === null ? null : shift(pause.resumedAt),
    })),
    heartbeatElapsedMs: shift(session.heartbeatElapsedMs),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

/** Reads a session folder. Only reads: nothing in it is ever changed by an export. */
export async function loadExportSource(folder: string): Promise<LoadSourceResult> {
  let raw: unknown;
  try {
    raw = await readJson(join(folder, SESSION_FILES.session));
  } catch {
    return { ok: false, reason: 'missing' };
  }
  const parsed = sessionFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const original = parsed.data;

  const files: ExportSource['files'] = {};
  for (const track of original.tracks) {
    const candidates = [track.playableFile, track.file].filter(
      (name): name is string => name !== undefined,
    );
    for (const name of candidates) {
      if (await exists(join(folder, name))) {
        files[track.kind] = join(folder, name);
        break;
      }
    }
  }
  if (files.screen === undefined) return { ok: false, reason: 'no-screen' };

  let log: SessionLog | null = null;
  if (original.input.status === 'recorded') {
    const names = [inputLogFileName(original.name)];
    try {
      names.push(...(await readdir(folder)).filter((name) => name.endsWith('.scrim.json')));
    } catch {
      // The folder was readable a moment ago. Without a listing only the expected name is tried.
    }
    for (const name of names) {
      try {
        const checked = sessionLogSchema.safeParse(await readJson(join(folder, name)));
        if (checked.success) {
          log = checked.data;
          break;
        }
      } catch {
        // Try the next candidate.
      }
    }
  }

  let edits = emptyEditList();
  try {
    const checked = editListSchema.safeParse(await readJson(join(folder, SESSION_FILES.edits)));
    if (checked.success) edits = checked.data;
  } catch {
    // No edit list means no edits.
  }

  return { ok: true, source: { session: rebaseSession(original), log, edits, files } };
}
