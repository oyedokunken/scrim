import type { RenderStyle, ResolutionPreset } from '@scrim/core/render';
import type { CursorPaint } from './compositor';
import type { ExportQuality } from './encoders';

/** What the person chooses in the export sheet. Automatic renders use the saved defaults. */
export interface ExportSettings {
  preset: ResolutionPreset;
  fps: 30 | 60;
  quality: ExportQuality;
  keepAudio: boolean;
  /** Linear gain applied to the microphone. 1 leaves it as recorded. */
  micGain: number;
  /** Draw the soft shadow under the recording when there is a background. */
  shadow: boolean;
}

export type Collision = 'number' | 'replace' | 'fail';

export interface ExportRequest {
  /** The working folder of the recording (`<name>.scrim`). Read only. */
  folder: string;
  /** The folder that receives the finished file. */
  outputDir: string;
  /** File name without the extension. Defaults to the recording name. */
  fileName?: string | undefined;
  /** What to do when the file already exists. The page asks the person first and sends `replace`. */
  collision: Collision;
  settings: ExportSettings;
  style: RenderStyle;
  paint: CursorPaint;
  /** Use only the software encoder, for the retry with safer settings. */
  softwareOnly?: boolean | undefined;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  /** 0 to 1. */
  fraction: number;
  /** Milliseconds left at the current speed, or null before there is a speed. */
  etaMs: number | null;
  /** Seconds of video made per second of work. */
  speed: number;
}

export type ExportErrorCode =
  | 'source-missing'
  | 'source-invalid'
  | 'nothing-to-export'
  | 'ffmpeg-missing'
  | 'no-encoder'
  | 'encode-failed'
  | 'verify-failed'
  | 'disk-full'
  | 'folder-unwritable'
  | 'exists'
  | 'cancelled'
  | 'unknown';

export interface ExportError {
  code: ExportErrorCode;
  message: string;
  nextStep: string;
  /** The last lines FFmpeg printed, for the failure screen. It can name files, so show it and never log it. */
  stderrTail?: string | undefined;
}

export interface ExportSuccess {
  ok: true;
  /** The finished file. */
  path: string;
  durationMs: number;
  bytes: number;
  encoder: string;
  /** Wall time the export took. */
  elapsedMs: number;
  /** Why effects are off, when they are. */
  note: string | null;
}

export type ExportOutcome = ExportSuccess | { ok: false; error: ExportError };
