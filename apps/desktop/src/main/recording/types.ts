import type { RecorderPhase, SessionFile, TrackKind } from '@scrim/core';

/**
 * The recording service boundary. Everything the rest of the app needs from the engine is a type in
 * this file: what to record, the state it reports, the errors it can return and the result of a
 * finished or recovered recording. The home screen and the IPC layer import from here and from
 * `recording-service.ts`, and from nothing else in this folder.
 */

/** What to record. A window needs its capture source id. A region is a display plus a crop. */
export type SourceSpec =
  | { kind: 'display'; displayId?: string | undefined }
  | {
      kind: 'region';
      displayId?: string | undefined;
      /** The area to keep, in device independent pixels on the desktop. */
      crop: { x: number; y: number; width: number; height: number };
    }
  | { kind: 'window'; sourceId: string };

export interface RecordingOptions {
  source: SourceSpec;
  camera: { enabled: boolean; deviceId?: string | undefined };
  mic: { enabled: boolean; deviceId?: string | undefined };
  /** The folder to save into. The Videos folder plus Scrim when left out. */
  destination?: string | undefined;
  /** The recording name, used for the folder and the files. A dated name when left out. */
  name?: string | undefined;
}

/** What a display or window looks like on the desktop, so mouse positions can be mapped to pixels. */
export interface ResolvedSource {
  kind: 'region' | 'display' | 'window';
  displayId?: string | undefined;
  crop?: { x: number; y: number; width: number; height: number } | undefined;
  /** Top left of the recorded area in device independent pixels on the desktop. */
  origin: { x: number; y: number };
  scaleFactor: number;
}

/** Everything a plain message needs: a stable code, words for the user and a next step. */
export interface RecordingError {
  code: RecordingErrorCode;
  /** What happened, in plain words. */
  message: string;
  /** What the user can do about it. */
  nextStep: string;
  /** The Node error code or a short technical note, for the log and never for the screen. */
  detail?: string | undefined;
}

export type RecordingErrorCode =
  | 'invalid-state'
  | 'disk-too-full'
  | 'disk-full'
  | 'folder-not-writable'
  | 'folder-unavailable'
  | 'write-failed'
  | 'screen-permission'
  | 'screen-unavailable'
  | 'display-removed'
  | 'recorder-failed'
  | 'recorder-crashed'
  | 'ffmpeg-missing'
  | 'remux-failed'
  | 'nothing-recoverable'
  | 'unknown';

export type Warning =
  | { code: 'disk-low'; message: string; freeBytes: number }
  | { code: 'camera-lost' | 'mic-lost'; message: string }
  | { code: 'camera-unavailable' | 'mic-unavailable'; message: string }
  | { code: 'input-unavailable'; message: string }
  | { code: 'cursor-visible'; message: string }
  | { code: 'writer-slow'; message: string };

export interface RecordingSnapshot {
  phase: RecorderPhase;
  /** Recorded time in milliseconds, with paused time left out. */
  elapsedMs: number;
  bytesWritten: number;
  tracks: { kind: TrackKind; bytesWritten: number; ended: boolean }[];
  warnings: Warning[];
  /** The session folder, once recording has begun. */
  folder?: string | undefined;
}

export type RecordingEvent =
  | { type: 'state'; snapshot: RecordingSnapshot }
  | { type: 'warning'; warning: Warning }
  | { type: 'error'; error: RecordingError }
  | { type: 'finished'; result: FinishedRecording };

export interface FinishedRecording {
  folder: string;
  name: string;
  /** Playable files made by remuxing, one per track that has one. */
  files: { kind: TrackKind; path: string }[];
  /** Recorded length in milliseconds, with paused time left out. */
  durationMs: number;
  bytes: number;
  /** The saved input log, when the mouse could be logged. */
  inputLog?: string | undefined;
  /** True when this result came from recovering a crashed recording. */
  recovered: boolean;
  warnings: string[];
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: RecordingError };

export interface RecoverableSession {
  folder: string;
  name: string;
  createdAt: string;
  /** Bytes of footage that reached the disk, across all tracks. */
  bytes: number;
}

export type SessionSummary = Pick<SessionFile, 'id' | 'name' | 'createdAt'>;
