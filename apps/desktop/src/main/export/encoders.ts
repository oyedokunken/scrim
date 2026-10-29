import type { ResolutionPreset } from '@scrim/core/render';
import type { FfmpegPaths, RunProcess } from '../recording/ffmpeg';

export type EncoderName =
  | 'h264_nvenc'
  | 'h264_qsv'
  | 'h264_amf'
  | 'h264_videotoolbox'
  | 'h264_vaapi'
  | 'h264_mf'
  | 'libopenh264';

/** Hardware first, then the Windows Media Foundation encoder, then the software one. */
export const ENCODER_ORDER: readonly EncoderName[] = [
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'h264_vaapi',
  'h264_mf',
  'libopenh264',
];

export type ExportQuality = 'low' | 'medium' | 'high';

const BITS_PER_PIXEL: Record<ExportQuality, number> = { low: 0.045, medium: 0.08, high: 0.13 };

/** Video bitrate for a size, a frame rate and a quality. Screen video needs far less than film. */
export function bitrateFor(input: {
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
}): number {
  const raw = input.width * input.height * input.fps * BITS_PER_PIXEL[input.quality];
  return Math.round(Math.min(60_000_000, Math.max(1_500_000, raw)));
}

/** Encoder options. The input is raw pictures, so only the encoder itself needs choosing. */
export function encoderArgs(
  encoder: EncoderName,
  input: { bitrate: number; fps: number },
): string[] {
  const rate = String(input.bitrate);
  const gop = String(Math.max(1, Math.round(input.fps * 2)));
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', encoder, '-preset', 'p4', '-b:v', rate, '-maxrate', rate, '-g', gop];
    case 'h264_qsv':
      return ['-c:v', encoder, '-b:v', rate, '-maxrate', rate, '-g', gop];
    case 'h264_amf':
      return ['-c:v', encoder, '-quality', 'balanced', '-b:v', rate, '-g', gop];
    case 'h264_videotoolbox':
      return ['-c:v', encoder, '-b:v', rate, '-g', gop];
    case 'h264_vaapi':
      return ['-c:v', encoder, '-b:v', rate, '-g', gop];
    case 'h264_mf':
      return ['-c:v', encoder, '-b:v', rate, '-g', gop];
    case 'libopenh264':
      return ['-c:v', encoder, '-b:v', rate, '-g', gop, '-allow_skip_frames', '0'];
  }
}

export interface EncoderChoice {
  encoder: EncoderName;
  /** Encoders that were tried first and did not work, for the log. */
  skipped: EncoderName[];
}

/**
 * Finds the first encoder in the list that really encodes a few frames of this size. A listed
 * encoder is not enough: a hardware one can be listed on a machine without the hardware.
 */
export async function pickEncoder(input: {
  run: RunProcess;
  paths: FfmpegPaths;
  width: number;
  height: number;
  fps: number;
  candidates?: readonly EncoderName[];
}): Promise<EncoderChoice | undefined> {
  const skipped: EncoderName[] = [];
  for (const encoder of input.candidates ?? ENCODER_ORDER) {
    const result = await input.run(
      input.paths.ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${String(input.width)}x${String(input.height)}:r=${String(input.fps)}`,
        '-frames:v',
        '12',
        ...encoderArgs(encoder, { bitrate: 4_000_000, fps: input.fps }),
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 20_000 },
    );
    if (result.code === 0) return { encoder, skipped };
    skipped.push(encoder);
  }
  return undefined;
}

/** A smaller preset one step below, for the retry with safer settings. */
export function saferPreset(current: ResolutionPreset): ResolutionPreset {
  switch (current) {
    case '2160p':
      return '1440p';
    case '1440p':
      return '1080p';
    case 'source':
    case '1080p':
      return '720p';
    case '720p':
      return '720p';
  }
}
