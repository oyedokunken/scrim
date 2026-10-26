import { z } from 'zod';

const nonNegative = z.number().nonnegative();

export const osSchema = z.enum(['windows', 'macos', 'linux']);
export const archSchema = z.enum(['x64', 'arm64']);

const rectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const trackKindSchema = z.enum(['screen', 'camera', 'mic']);
export type TrackKind = z.infer<typeof trackKindSchema>;

/** Why a track stopped before the recording did. Unset when it ran to the end. */
export const trackEndReasonSchema = z.enum([
  'device-removed',
  'error',
  'disk-full',
  'folder-unavailable',
  'renderer-crash',
]);

const trackSchema = z.strictObject({
  kind: trackKindSchema,
  /** The raw file in the session folder, such as `screen.raw.webm`. */
  file: z.string().min(1),
  mimeType: z.string().min(1),
  /** When the track started, in milliseconds on the main clock. */
  startedAt: nonNegative,
  bytesWritten: z.number().int().nonnegative(),
  /** True once the writer finished and closed the raw file. */
  complete: z.boolean(),
  endedReason: trackEndReasonSchema.optional(),
  /** The playable copy made by remuxing, once it exists and has been checked. */
  playableFile: z.string().min(1).optional(),
});

const inputSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('recorded'), file: z.string().min(1) }),
  z.strictObject({
    status: z.literal('unavailable'),
    reason: z.enum(['wayland', 'permission', 'error']),
  }),
]);

/**
 * `session.json`, version 1. It is rewritten atomically on every heartbeat, so after a crash it
 * says what was being recorded, how much reached the disk and that the recording never closed
 * cleanly. `cleanClose` is true only when every track is complete and the input log is saved.
 */
export const sessionFileSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  app: z.strictObject({ version: z.string(), os: osSchema, arch: archSchema }),
  /** Process id of the app that owns this recording, so recovery can tell a crash from a live one. */
  pid: z.number().int().positive(),
  source: z.strictObject({
    kind: z.enum(['region', 'display', 'window']),
    displayId: z.string().optional(),
    /** The recorded area in device independent pixels on the desktop, for a region. */
    crop: rectSchema.optional(),
    /** The same area in physical pixels of the video, which is what export cuts. */
    cropPx: rectSchema.optional(),
    /** Top left of the recorded display or window on the desktop, in device independent pixels. */
    origin: z.strictObject({ x: z.number(), y: z.number() }),
    scaleFactor: z.number().positive(),
    /** Size of the recorded video in pixels, when known. */
    frame: z
      .strictObject({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
  }),
  capture: z.strictObject({
    /**
     * Whether the system cursor is part of the recorded video. On Windows it always is: Chromium
     * ignores the request to hide it (ADR 0001). False only when a capture backend hides it.
     */
    cursorInCapture: z.boolean(),
  }),
  /**
   * For a window recording: whether the window's position was logged over time, in
   * `window-bounds.ndjson`. Left out for a display or a region.
   */
  windowBounds: z
    .discriminatedUnion('status', [
      z.strictObject({ status: z.literal('recorded'), file: z.string().min(1) }),
      z.strictObject({ status: z.literal('unavailable') }),
    ])
    .optional(),
  tracks: z.array(trackSchema),
  clock: z.strictObject({
    /** Milliseconds to add to a renderer `performance.now()` value to get main clock time. */
    rendererOffsetMs: z.number(),
    /** Half the round trip of the best ping, so the offset is right within this much. */
    uncertaintyMs: nonNegative,
  }),
  /** Pauses on the main clock, in milliseconds. An open pause has no `resumedAt`. */
  pauses: z.array(z.strictObject({ pausedAt: nonNegative, resumedAt: nonNegative.nullable() })),
  input: inputSchema,
  warnings: z.array(z.string()),
  heartbeatAt: z.iso.datetime(),
  /** The main clock at the last heartbeat, in milliseconds, so recovery knows how far it got. */
  heartbeatElapsedMs: nonNegative,
  cleanClose: z.boolean(),
  /** True when the session was closed by recovery after a crash. */
  recovered: z.boolean().optional(),
});

export type SessionFile = z.infer<typeof sessionFileSchema>;
export type SessionTrack = SessionFile['tracks'][number];
