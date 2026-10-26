/**
 * What the main process and the hidden recorder page say to each other. It is a private channel
 * between two pieces of our own code, not part of the typed bridge the app window uses. Commands
 * go from main to the page. Events come back, and main validates every one of them against the
 * schemas in `protocol-schemas.ts`. This file has no runtime dependencies, so the page can use it.
 */

export type TrackKind = 'screen' | 'camera' | 'mic';

export interface TrackRequest {
  kind: TrackKind;
  /** A camera or microphone to use. The default device when left out. */
  deviceId?: string | undefined;
}

export type RecorderCommand =
  | {
      type: 'configure';
      tracks: readonly TrackRequest[];
      timesliceMs: number;
      screenBitsPerSecond: number;
    }
  | { type: 'ping'; id: number; mainSentAt: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' };

/** Channel names. The same strings are used by main, the recorder preload and the page. */
export const RECORDER_CHANNELS = {
  command: 'scrim-recorder:command',
  event: 'scrim-recorder:event',
  ports: 'scrim-recorder:ports',
} as const;

/** The message the preload posts to the page, with the chunk ports in its transfer list. */
export const PORTS_MESSAGE_TYPE = 'scrim-recorder-ports';

/** Why a track could not be opened, in terms the app can turn into a message. */
export type TrackFailureReason =
  'permission-denied' | 'device-missing' | 'device-busy' | 'unsupported' | 'unknown';

export type CursorState = 'hidden' | 'shown' | 'unknown';

export type RecorderEvent =
  | { type: 'loaded' }
  | {
      type: 'ready';
      tracks: { kind: TrackKind; mimeType: string; label?: string | undefined }[];
      failed: { kind: TrackKind; reason: TrackFailureReason; message: string }[];
      /** What the capture settings say about the cursor: `never` means it is left out. */
      cursor: CursorState;
      frame?: { width: number; height: number } | undefined;
    }
  | { type: 'ports-attached'; kinds: TrackKind[] }
  | { type: 'pong'; id: number; mainSentAt: number; rendererNow: number }
  | { type: 'track-started'; kind: TrackKind; rendererNow: number }
  | { type: 'paused'; rendererNow: number }
  | { type: 'resumed'; rendererNow: number }
  | { type: 'track-ended'; kind: TrackKind; rendererNow: number }
  | { type: 'track-error'; kind: TrackKind; message: string; rendererNow: number }
  | { type: 'stopped'; tracks: { kind: TrackKind; chunks: number; bytes: number }[] }
  | { type: 'fatal'; message: string };

/** One chunk on a track's port. `data` travels in the transfer list, so it is moved, not copied. */
export interface ChunkMessage {
  track: TrackKind;
  seq: number;
  byteLength: number;
  mediaTimeMs: number;
  data: ArrayBuffer;
}
