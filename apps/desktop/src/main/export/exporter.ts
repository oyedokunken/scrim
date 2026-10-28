import { createRenderModel } from '@scrim/core/render';

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { join } from 'node:path';
import type { FfmpegPaths, RunProcess } from '../recording/ffmpeg';
import { probeFile } from '../recording/ffmpeg';
import { buildAudioGraph } from './audio-graph';
import { createBubbleTrack } from './bubble';
import { Compositor } from './compositor';
import type { BubblePlacement } from './compositor';
import { bitrateFor, encoderArgs, pickEncoder } from './encoders';
import type { EncoderName } from './encoders';
import { FrameCursor, FrameReader } from './frames';
import { buildBase } from './raster';
import type { Raster } from './raster';
import { loadExportSource } from './source';
import type { ExportSource } from './source';
import type { ExportError, ExportOutcome, ExportProgress, ExportRequest } from './types';
import { verifyOutput } from './verify';

export interface ExporterDeps {
  paths: FfmpegPaths;
  run: RunProcess;
  /** Messages for the log. They never carry a path or a recording name. */
  log: (message: string) => void;
  now?: () => number;
}

const STDERR_TAIL = 6 * 1024;

function tailOf(text: string): string {
  return text.trim().split('\n').slice(-12).join('\n');
}

function fail(
  code: ExportError['code'],
  message: string,
  nextStep: string,
  stderrTail?: string,
): ExportOutcome {
  return {
    ok: false,
    error: {
      code,
      message,
      nextStep,
      ...(stderrTail === undefined || stderrTail === '' ? {} : { stderrTail }),
    },
  };
}

/** A file name that does not exist yet: `name.mp4`, then `name 2.mp4`, `name 3.mp4`. */
export async function uniqueOutputPath(
  dir: string,
  name: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  let candidate = join(dir, `${name}.mp4`);
  for (let n = 2; await exists(candidate); n += 1) {
    candidate = join(dir, `${name} ${String(n)}.mp4`);
  }
  return candidate;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function errnoOf(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = errnoOf(error);
      if (attempt >= 6 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

interface Child {
  process: ChildProcess;
  stderr: () => string;
  exited: Promise<number | null>;
}

function start(command: string, args: readonly string[], withInput: boolean): Child {
  const child = spawn(command, [...args], {
    windowsHide: true,
    // A decoder's output is read by us. The encoder writes a file, so its output is not needed.
    stdio: [withInput ? 'pipe' : 'ignore', withInput ? 'ignore' : 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (data: Buffer) => {
    stderr = (stderr + data.toString('utf8')).slice(-STDERR_TAIL);
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', (error) => {
      stderr += `
${error.message}`;
      resolve(null);
    });
    // The close event waits for the output pipe to drain, which a killed decoder never does.
    child.on('exit', (code) => {
      child.stdout?.destroy();
      setTimeout(() => {
        resolve(code);
      }, 50);
    });
  });
  child.stdin?.on('error', () => undefined);
  return { process: child, stderr: () => stderr, exited };
}

function stdoutOf(child: Child): Readable {
  const stream = child.process.stdout;
  if (stream === null) throw new Error('The process has no output.');
  return stream;
}

function writeAll(stream: NodeJS.WritableStream, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error?: Error): void => {
      reject(error ?? new Error('closed'));
    };
    stream.once('error', onError);
    stream.once('close', onError);
    const done = (): void => {
      stream.off('error', onError);
      stream.off('close', onError);
      resolve();
    };
    if (stream.write(data)) done();
    else stream.once('drain', done);
  });
}

/** The filter that cuts the recorded area out of the decoded video at a constant frame rate. */
export function screenFilter(
  source: Pick<ExportSource, 'session'>,
  target: { width: number; height: number },
  video: { width: number; height: number },
  fps: number,
): string {
  const parts = [`fps=${String(fps)}:start_time=0`];
  const { cropPx, frame } = source.session.source;
  let width = video.width;
  let height = video.height;
  if (cropPx !== undefined) {
    const kx = frame === undefined ? 1 : video.width / frame.width;
    const ky = frame === undefined ? 1 : video.height / frame.height;
    const x = Math.max(0, Math.min(video.width - 2, Math.round(cropPx.x * kx)));
    const y = Math.max(0, Math.min(video.height - 2, Math.round(cropPx.y * ky)));
    width = Math.max(2, Math.min(video.width - x, Math.round(cropPx.width * kx)));
    height = Math.max(2, Math.min(video.height - y, Math.round(cropPx.height * ky)));
    parts.push(`crop=${String(width)}:${String(height)}:${String(x)}:${String(y)}`);
  }
  if (width !== target.width || height !== target.height) {
    parts.push(`scale=${String(target.width)}:${String(target.height)}:flags=bicubic`);
  }
  parts.push('format=bgr0');
  return parts.join(',');
}

async function loadBackgroundImage(
  deps: ExporterDeps,
  path: string,
  size: { width: number; height: number },
): Promise<Raster | undefined> {
  const w = String(size.width);
  const h = String(size.height);
  const child = start(
    deps.paths.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=bgr0`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'bgr0',
      '-',
    ],
    false,
  );
  const frame = await new FrameReader(stdoutOf(child), size.width * size.height * 4).next();
  child.process.kill();
  await child.exited;
  return frame === null ? undefined : { ...size, data: frame };
}

export interface ExportOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: ExportProgress) => void) | undefined;
}

/**
 * Renders a recording to a finished MP4. The working folder is only read. The file is written as
 * `<name>.mp4.partial`, read back with ffprobe, and renamed only when it is the file that was
 * planned, so a failed export never leaves something that looks finished.
 */
export async function exportRecording(
  deps: ExporterDeps,
  request: ExportRequest,
  options: ExportOptions = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? Date.now;
  const began = now();
  const { signal } = options;
  const cancelled = (): boolean => signal?.aborted === true;

  const loaded = await loadExportSource(request.folder);
  if (!loaded.ok) {
    return loaded.reason === 'invalid'
      ? fail(
          'source-invalid',
          "This recording's file is damaged.",
          'Your original recording was not changed. Try Recover from the home screen.',
        )
      : fail(
          'source-missing',
          'The recording could not be found.',
          'It may have been moved or deleted. Open the recordings list and pick it again.',
        );
  }
  const source = loaded.source;
  const { settings } = request;

  const screenFile = source.files.screen;
  if (screenFile === undefined) {
    return fail(
      'source-missing',
      'The screen video is missing.',
      'Your other files were not changed.',
    );
  }
  const video = await probeFile(deps.run, deps.paths, screenFile);
  if (video?.width === undefined || video.height === undefined) {
    return fail(
      'source-invalid',
      'The screen video could not be read.',
      'Your original recording was not changed. Try Recover from the home screen.',
    );
  }

  const model = createRenderModel({
    session: source.session,
    log: source.log === null ? null : { frame: source.log.frame, events: source.log.events },
    edits: source.edits,
    settings: {
      preset: settings.preset,
      fps: settings.fps,
      keepAudio: settings.keepAudio,
      style: request.style,
    },
  });
  if (model.frameCount === 0) {
    return fail(
      'nothing-to-export',
      'There is nothing to export: the trim and cuts remove the whole recording.',
      'Change the trim or the cuts and try again.',
    );
  }
  const layout = settings.shadow ? model.layout : { ...model.layout, shadow: null };
  const { width, height } = layout.output;
  const fps = model.fps;

  // Where the finished file goes, decided before any work so a clash is reported at once.
  const name = request.fileName ?? source.session.name;
  const wanted = join(request.outputDir, `${name}.mp4`);
  let finalPath = wanted;
  if (request.collision === 'number') {
    finalPath = await uniqueOutputPath(request.outputDir, name, pathExists);
  } else if (request.collision === 'fail' && (await pathExists(wanted))) {
    return fail(
      'exists',
      'A file with that name is already there.',
      'Pick another name, or replace it.',
    );
  }
  const partial = `${finalPath}.partial`;

  const bitrate = bitrateFor({ width, height, fps, quality: settings.quality });
  try {
    await mkdir(request.outputDir, { recursive: true });
    const free = await statfs(request.outputDir);
    const needed = (bitrate / 8) * (model.totalMs / 1000) * 1.25 + 64 * 1024 * 1024;
    if (free.bavail * free.bsize < needed) {
      return fail(
        'disk-full',
        'There is not enough free space for the finished video.',
        'Free some space or choose another folder. Your recording was not changed.',
      );
    }
    await writeFile(partial, '');
  } catch (error) {
    const code = errnoOf(error);
    return fail(
      code === 'ENOSPC' ? 'disk-full' : 'folder-unwritable',
      code === 'ENOSPC' ? 'The disk is full.' : 'Scrim cannot write to that folder.',
      'Choose another folder in the export options. Your recording was not changed.',
    );
  }

  const choice = await pickEncoder({
    run: deps.run,
    paths: deps.paths,
    width,
    height,
    fps,
    ...(request.softwareOnly === true ? { candidates: ['libopenh264'] as EncoderName[] } : {}),
  });
  if (choice === undefined) {
    await rm(partial, { force: true });
    return fail(
      'no-encoder',
      'No video encoder worked on this computer.',
      'Try again with a smaller size. If it keeps failing, report it on GitHub.',
    );
  }
  deps.log(`export: encoder ${choice.encoder}, skipped ${choice.skipped.join(', ') || 'none'}`);

  const background =
    layout.background.kind === 'image'
      ? await loadBackgroundImage(deps, layout.background.path, layout.output)
      : undefined;
  const compositor = new Compositor(
    layout,
    model.source,
    buildBase(layout, background),
    request.paint,
  );

  const bubbles =
    source.files.camera === undefined
      ? null
      : createBubbleTrack({
          session: source.session,
          source: model.source,
          layout,
          staticBubble: model.describeAt(0).bubble,
          shape: request.style.bubble?.shape ?? 'circle',
        });
  const cameraSize = bubbles === null ? 0 : Math.max(16, Math.ceil(bubbles.maxSide / 2) * 2);

  const audio =
    source.files.mic === undefined
      ? null
      : buildAudioGraph(model.audio, { micInput: 1, gain: settings.micGain });

  const screen = start(
    deps.paths.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      screenFile,
      '-an',
      '-sn',
      '-vf',
      screenFilter(source, model.source, { width: video.width, height: video.height }, fps),
      '-f',
      'rawvideo',
      '-pix_fmt',
      'bgr0',
      '-',
    ],
    false,
  );
  const camera =
    source.files.camera === undefined || bubbles === null
      ? null
      : start(
          deps.paths.ffmpeg,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            source.files.camera,
            '-an',
            '-sn',
            '-vf',
            `fps=${String(fps)}:start_time=0,crop=min(iw\\,ih):min(iw\\,ih),scale=${String(cameraSize)}:${String(cameraSize)}:flags=bicubic,format=bgr0`,
            '-f',
            'rawvideo',
            '-pix_fmt',
            'bgr0',
            '-',
          ],
          false,
        );

  const encoder = start(
    deps.paths.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'bgr0',
      '-s',
      `${String(width)}x${String(height)}`,
      '-r',
      String(fps),
      '-i',
      'pipe:0',
      ...(audio === null || source.files.mic === undefined
        ? []
        : ['-i', source.files.mic, '-filter_complex', audio.filter]),
      '-map',
      '0:v',
      ...(audio === null ? [] : ['-map', `[${audio.label}]`]),
      ...encoderArgs(choice.encoder, { bitrate, fps }),
      ...(audio === null ? ['-an'] : ['-c:a', 'aac', '-b:a', '160k']),
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      partial,
    ],
    true,
  );

  const children = [screen, camera, encoder].filter((child): child is Child => child !== null);
  const onAbort = (): void => {
    for (const child of children) child.process.kill();
  };
  signal?.addEventListener('abort', onAbort);

  const screenCursor = new FrameCursor(
    new FrameReader(stdoutOf(screen), model.source.width * model.source.height * 4),
  );
  const cameraCursor =
    camera === null
      ? null
      : new FrameCursor(new FrameReader(stdoutOf(camera), cameraSize * cameraSize * 4));

  let written = 0;
  let broken: string | undefined;
  const speedStart = now();
  try {
    const stdin = encoder.process.stdin;
    if (stdin === null) throw new Error('The encoder has no input.');
    for (let i = 0; i < model.frameCount; i += 1) {
      if (cancelled()) break;
      const description = model.describeFrame(i);
      const screenFrame = await screenCursor.at(
        Math.round((description.screenTimeMs * fps) / 1000),
      );
      if (screenFrame === null) {
        broken = 'The screen video ended before its first picture.';
        break;
      }
      let cameraFrame: Buffer | null = null;
      let placement: BubblePlacement | null = null;
      if (cameraCursor !== null && description.cameraTimeMs !== null && bubbles !== null) {
        cameraFrame = await cameraCursor.at(Math.round((description.cameraTimeMs * fps) / 1000));
        placement = bubbles.at(description.recordingTimeMs);
      }
      const out = Buffer.allocUnsafe(width * height * 4);
      compositor.render(
        {
          screen: screenFrame,
          camera: cameraFrame,
          cameraSize,
          view: description.view,
          cursor: description.cursor,
          bubble: cameraFrame === null ? null : placement,
        },
        out,
      );
      await writeAll(stdin, out);
      written += 1;
      if (written === 1 || written % 60 === 0)
        deps.log(`export: ${String(written)} of ${String(model.frameCount)} frames`);
      if (options.onProgress !== undefined && (written % 8 === 0 || written === model.frameCount)) {
        const elapsed = Math.max(1, now() - speedStart);
        const speed = (written * 1000) / fps / elapsed;
        options.onProgress({
          frame: written,
          totalFrames: model.frameCount,
          fraction: written / model.frameCount,
          etaMs: speed > 0 ? ((model.frameCount - written) * 1000) / fps / speed : null,
          speed,
        });
      }
    }
  } catch (error) {
    broken = `The encoder stopped taking pictures (${errnoOf(error) ?? 'write failed'}).`;
  }

  try {
    encoder.process.stdin?.end();
  } catch {
    // The encoder already closed its input.
  }
  screen.process.kill();
  camera?.process.kill();
  deps.log('export: waiting for the encoder');
  const code = await encoder.exited;
  deps.log(`export: encoder exited ${String(code)}`);
  await screen.exited;
  await camera?.exited;
  deps.log('export: decoders exited');
  signal?.removeEventListener('abort', onAbort);

  if (cancelled()) {
    await rm(partial, { force: true });
    return fail('cancelled', 'The export was cancelled.', 'Your recording was not changed.');
  }
  const stderr = tailOf(
    [encoder.stderr(), screen.stderr(), camera?.stderr() ?? '']
      .filter((text) => text.trim() !== '')
      .join('\n'),
  );
  if (broken !== undefined || code !== 0 || written !== model.frameCount) {
    await rm(partial, { force: true });
    const missing = code === null && stderr.includes('ENOENT');
    return missing
      ? fail(
          'ffmpeg-missing',
          'The video tool that comes with Scrim could not be started.',
          'Reinstall Scrim. Your recording was not changed.',
          stderr,
        )
      : fail(
          'encode-failed',
          broken ?? 'The video could not be written.',
          'Try again with safer settings. Your recording was not changed.',
          stderr,
        );
  }

  const verdict = await verifyOutput(deps.run, deps.paths, partial, {
    width,
    height,
    durationMs: (model.frameCount * 1000) / fps,
    audio: audio !== null,
    fps,
  });
  if (!verdict.ok) {
    await rm(partial, { force: true });
    return fail(
      'verify-failed',
      verdict.problem,
      'Try again with safer settings. Your recording was not changed.',
      stderr,
    );
  }

  try {
    await renameWithRetry(partial, finalPath);
  } catch {
    await rm(partial, { force: true });
    return fail(
      'folder-unwritable',
      'The finished video could not be moved into place.',
      'Close any program that has the file open and try again.',
    );
  }
  const bytes = (await stat(finalPath)).size;
  await writeFile(
    join(request.folder, 'export.json'),
    JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), file: finalPath, bytes }),
  ).catch(() => undefined);
  deps.log(
    `export: done with ${choice.encoder}, ${String(model.frameCount)} frames, ${String(now() - began)} ms`,
  );
  return {
    ok: true,
    path: finalPath,
    durationMs: model.totalMs,
    bytes,
    encoder: choice.encoder,
    elapsedMs: now() - began,
    note: model.effectsOffReason,
  };
}
