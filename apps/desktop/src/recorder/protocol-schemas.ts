import { z } from 'zod';
import type { ChunkMessage, RecorderEvent } from './protocol';

export const trackKindSchema = z.enum(['screen', 'camera', 'mic']);

const trackFailureReasonSchema = z.enum([
  'permission-denied',
  'device-missing',
  'device-busy',
  'unsupported',
  'unknown',
]);

const rendererNow = z.number();

/** Every event the recorder page may send. Strict, so a stray field is rejected. */
export const recorderEventSchema: z.ZodType<RecorderEvent> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('loaded') }),
  z.strictObject({
    type: z.literal('ready'),
    tracks: z.array(
      z.strictObject({
        kind: trackKindSchema,
        mimeType: z.string().min(1),
        label: z.string().optional(),
      }),
    ),
    failed: z.array(
      z.strictObject({
        kind: trackKindSchema,
        reason: trackFailureReasonSchema,
        message: z.string(),
      }),
    ),
    cursor: z.enum(['hidden', 'shown', 'unknown']),
    frame: z
      .strictObject({ width: z.number().int().positive(), height: z.number().int().positive() })
      .optional(),
  }),
  z.strictObject({ type: z.literal('ports-attached'), kinds: z.array(trackKindSchema) }),
  z.strictObject({
    type: z.literal('pong'),
    id: z.number(),
    mainSentAt: z.number(),
    rendererNow,
  }),
  z.strictObject({ type: z.literal('track-started'), kind: trackKindSchema, rendererNow }),
  z.strictObject({ type: z.literal('paused'), rendererNow }),
  z.strictObject({ type: z.literal('resumed'), rendererNow }),
  z.strictObject({ type: z.literal('track-ended'), kind: trackKindSchema, rendererNow }),
  z.strictObject({
    type: z.literal('track-error'),
    kind: trackKindSchema,
    message: z.string(),
    rendererNow,
  }),
  z.strictObject({
    type: z.literal('stopped'),
    tracks: z.array(
      z.strictObject({
        kind: trackKindSchema,
        chunks: z.number().int().nonnegative(),
        bytes: z.number().int().nonnegative(),
      }),
    ),
  }),
  z.strictObject({ type: z.literal('fatal'), message: z.string() }),
]);

/** Checks a message from a chunk port. The data must be a real buffer and the numbers sane. */
export function parseChunkMessage(value: unknown): ChunkMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { track, seq, byteLength, mediaTimeMs, data } = value as Record<string, unknown>;
  const kind = trackKindSchema.safeParse(track);
  if (
    !kind.success ||
    typeof seq !== 'number' ||
    !Number.isInteger(seq) ||
    seq < 0 ||
    typeof byteLength !== 'number' ||
    typeof mediaTimeMs !== 'number' ||
    !Number.isFinite(mediaTimeMs) ||
    !(data instanceof ArrayBuffer)
  ) {
    return undefined;
  }
  return { track: kind.data, seq, byteLength, mediaTimeMs, data };
}
