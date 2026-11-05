import { z } from 'zod';

export type PillPhase = 'recording' | 'paused' | 'saving';

/** Why a button cannot be used right now. Shown as a short message in the pill. */
const mediaErrorSchema = z.enum(['device-removed', 'device-busy', 'permission-denied', 'unknown']);
export type MediaError = z.infer<typeof mediaErrorSchema>;

/**
 * One device on the pill. `available` is false when it was off before recording started, and a
 * device cannot be turned on mid recording. `active` is the mic not muted, or the camera shown.
 */
const mediaDeviceStateSchema = z.strictObject({
  available: z.boolean(),
  active: z.boolean(),
  error: mediaErrorSchema.optional(),
});
export type MediaDeviceState = z.infer<typeof mediaDeviceStateSchema>;

/** What the microphone and camera buttons show. It lives in main and is broadcast on every change. */
export const mediaStateSchema = z.strictObject({
  mic: mediaDeviceStateSchema,
  camera: mediaDeviceStateSchema,
});
export type MediaState = z.infer<typeof mediaStateSchema>;

/** Everything the pill shows. It never carries a path or a name. */
export interface PillState {
  phase: PillPhase;
  /** Recorded time in milliseconds, with paused time left out. */
  elapsedMs: number;
  /** A pause, resume or stop is in flight, so the buttons wait. */
  busy: boolean;
  media: MediaState;
}

/**
 * What the pill page may ask for. Strict, and checked in main before anything happens. `discard`
 * is only sent after the person confirmed in the pill itself. The two media actions say the state
 * the person wants, never "flip", so a repeated press is the same request twice.
 */
export const pillActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({ type: z.literal('resume') }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('discard') }),
  z.strictObject({ type: z.literal('set-mic-muted'), muted: z.boolean() }),
  z.strictObject({ type: z.literal('set-camera-enabled'), enabled: z.boolean() }),
]);
export type PillAction = z.infer<typeof pillActionSchema>;
