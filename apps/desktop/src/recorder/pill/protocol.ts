import { z } from 'zod';

export type PillPhase = 'recording' | 'paused' | 'saving';

/** Everything the pill shows. It never carries a path or a name. */
export interface PillState {
  phase: PillPhase;
  /** Recorded time in milliseconds, with paused time left out. */
  elapsedMs: number;
  /** A pause, resume or stop is in flight, so the buttons wait. */
  busy: boolean;
}

/**
 * What the pill page may ask for. Strict, and checked in main before anything happens. `discard`
 * is only sent after the person confirmed in the pill itself.
 */
export const pillActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('pause') }),
  z.strictObject({ type: z.literal('resume') }),
  z.strictObject({ type: z.literal('stop') }),
  z.strictObject({ type: z.literal('discard') }),
]);
export type PillAction = z.infer<typeof pillActionSchema>;
