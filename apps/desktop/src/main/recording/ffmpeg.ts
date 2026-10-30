import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';

export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

/**
 * The one place that decides which FFmpeg to run. In development it is the one on the PATH. A
 * packaged app will run a bundled build from its resources folder, once that build is chosen
 * and added (an ADR is needed for the build and its license).
 */
export function resolveFfmpegPaths(input: {
  isPackaged: boolean;
  resourcesPath: string;
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}): FfmpegPaths {
  const suffix = input.platform === 'win32' ? '.exe' : '';
  if (input.isPackaged) {
    return {
      ffmpeg: join(input.resourcesPath, 'ffmpeg', `ffmpeg${suffix}`),
      ffprobe: join(input.resourcesPath, 'ffmpeg', `ffprobe${suffix}`),
    };
  }
  return {
    ffmpeg: input.env['SCRIM_FFMPEG'] ?? 'ffmpeg',
    ffprobe: input.env['SCRIM_FFPROBE'] ?? 'ffprobe',
  };
}

export interface ProcessResult {
  /** Null when the process could not be started or was killed. */
  code: number | null;
  stdout: string;
  /** The end of stderr, so a failure can be shown without a wall of text. */
  stderr: string;
  /** Set when the process could not be started, such as `ENOENT` for a missing program. */
  spawnError?: string | undefined;
}

export type RunProcess = (
  command: string,
  args: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<ProcessResult>;

const STDERR_TAIL = 8 * 1024;
const STDOUT_LIMIT = 4 * 1024 * 1024;

/**
 * Runs a program with an argument array. There is no shell, so no file name can be read as a
 * command or an option by anything but the program itself.
 */
export const runProcess: RunProcess = (command, args, options) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(
      () => {
        child.kill();
        finish({ code: null, stdout, stderr, spawnError: 'timeout' });
      },
      options?.timeoutMs ?? 10 * 60 * 1000,
    );

    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < STDOUT_LIMIT) stdout += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString('utf8')).slice(-STDERR_TAIL);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({ code: null, stdout, stderr, spawnError: error.code ?? error.message });
    });
    child.on('close', (code) => {
      finish({ code, stdout, stderr });
    });
  });

export interface ProbeResult {
  videoCodec?: string | undefined;
  audioCodec?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  /** Frames per second of the video, when ffprobe reports a sensible one. */
  fps?: number | undefined;
  durationSec?: number | undefined;
}

const probeJsonSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        codec_name: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        duration: z.string().optional(),
        avg_frame_rate: z.string().optional(),
      }),
    )
    .optional(),
  format: z.object({ duration: z.string().optional() }).optional(),
});

/** `30000/1001` becomes 29.97. Variable rate or missing values give undefined. */
function framesPerSecond(rate: string | undefined): number | undefined {
  const match = /^(\d+)\/(\d+)$/.exec(rate ?? '');
  if (match === null || Number(match[2]) === 0) return undefined;
  const fps = Number(match[1]) / Number(match[2]);
  return fps > 0 && fps <= 240 ? Math.round(fps * 100) / 100 : undefined;
}

/** Reads what ffprobe says about a file. Returns undefined when it cannot be read at all. */
export async function probeFile(
  run: RunProcess,
  paths: FfmpegPaths,
  file: string,
): Promise<ProbeResult | undefined> {
  const result = await run(
    paths.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
    { timeoutMs: 20_000 },
  );
  if (result.code !== 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
  const checked = probeJsonSchema.safeParse(parsed);
  if (!checked.success) return undefined;
  const json = checked.data;
  const streams = json.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const seconds = Number(json.format?.duration ?? video?.duration ?? audio?.duration);
  return {
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    width: video?.width,
    height: video?.height,
    fps: framesPerSecond(video?.avg_frame_rate),
    durationSec: Number.isFinite(seconds) ? seconds : undefined,
  };
}

export type RemuxResult =
  | { ok: true; probe: ProbeResult }
  | { ok: false; reason: 'ffmpeg-missing' | 'failed' | 'unplayable'; detail: string };

/**
 * Copies a raw track into a playable file without re-encoding: `ffmpeg -c copy`. The output is
 * written under a temporary name, checked with ffprobe, then renamed into place, so a failed or
 * half finished run never leaves a broken file under the final name. The raw file is only read.
 * A truncated tail, as after a crash, is expected: FFmpeg stops at the last good frame and the
 * result still counts when it probes as playable.
 */
export async function remuxTrack(input: {
  run: RunProcess;
  paths: FfmpegPaths;
  raw: string;
  output: string;
  /** `.tmp` plus the extension, so FFmpeg picks the container from the name. */
  temp: string;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  requireVideo: boolean;
}): Promise<RemuxResult> {
  const { run, paths, raw, output, temp } = input;
  const result = await run(paths.ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    raw,
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    temp,
  ]);
  if (result.spawnError === 'ENOENT') {
    return { ok: false, reason: 'ffmpeg-missing', detail: result.spawnError };
  }

  const probe = await probeFile(run, paths, temp);
  const playable =
    probe !== undefined &&
    (input.requireVideo ? probe.videoCodec !== undefined : probe.audioCodec !== undefined) &&
    (probe.durationSec === undefined || probe.durationSec > 0);
  if (probe === undefined || !playable) {
    await input.remove(temp).catch(() => undefined);
    return {
      ok: false,
      reason: result.code === 0 ? 'unplayable' : 'failed',
      detail: result.stderr.trim().split('\n').slice(-4).join(' ') || 'No usable media was found.',
    };
  }
  await input.rename(temp, output);
  return { ok: true, probe };
}
