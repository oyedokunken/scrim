import { z } from 'zod';
import type { FfmpegPaths, RunProcess } from '../recording/ffmpeg';

const probeSchema = z.object({
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        codec_name: z.string().optional(),
        pix_fmt: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    )
    .optional(),
  format: z.object({ duration: z.string().optional() }).optional(),
});

export interface Expectation {
  width: number;
  height: number;
  durationMs: number;
  audio: boolean;
  fps: number;
}

export type Verdict = { ok: true } | { ok: false; problem: string };

/**
 * Looks at a finished file the way a player would: H.264 in yuv420p at the planned size, AAC when
 * there is sound, one stream of each, and a length close to the plan.
 */
export async function verifyOutput(
  run: RunProcess,
  paths: FfmpegPaths,
  file: string,
  expected: Expectation,
): Promise<Verdict> {
  const result = await run(paths.ffprobe, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    file,
  ]);
  if (result.code !== 0) return { ok: false, problem: 'The finished file could not be read back.' };
  let json: unknown;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    return { ok: false, problem: 'The finished file could not be read back.' };
  }
  const parsed = probeSchema.safeParse(json);
  if (!parsed.success) return { ok: false, problem: 'The finished file could not be read back.' };
  const streams = parsed.data.streams ?? [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  const video = videos[0];
  if (videos.length !== 1 || video === undefined || video.codec_name !== 'h264') {
    return { ok: false, problem: 'The finished file has no H.264 video.' };
  }
  if (video.pix_fmt !== 'yuv420p') {
    return { ok: false, problem: `The video is ${video.pix_fmt ?? 'unknown'}, not yuv420p.` };
  }
  if (video.width !== expected.width || video.height !== expected.height) {
    return { ok: false, problem: 'The video size is not the size that was planned.' };
  }
  if (expected.audio) {
    if (audios.length !== 1 || audios[0]?.codec_name !== 'aac') {
      return { ok: false, problem: 'The finished file has no AAC sound.' };
    }
  } else if (audios.length !== 0) {
    return { ok: false, problem: 'The finished file has sound that was not asked for.' };
  }
  const seconds = Number(parsed.data.format?.duration);
  const tolerance = Math.max(0.35, 3 / expected.fps);
  if (!Number.isFinite(seconds) || Math.abs(seconds - expected.durationMs / 1000) > tolerance) {
    return { ok: false, problem: 'The length of the finished file is not the planned length.' };
  }
  return { ok: true };
}
