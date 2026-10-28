import { z } from 'zod';

/** One zoom moment as saved in `edits.json`. Times are on the recording clock, in milliseconds. */
export const zoomMomentSchema = z
  .strictObject({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    x: z.number(),
    y: z.number(),
  })
  .refine((value) => value.endMs > value.startMs, {
    message: 'A moment must end after it starts.',
  });

/**
 * The zoom part of `edits.json`. When it is present the moments in it replace the ones found from
 * the clicks, and an empty list means no zoom at all. When it is absent the planner decides.
 */
export const zoomEditsSchema = z.strictObject({ moments: z.array(zoomMomentSchema).max(2000) });

export type ZoomEdits = z.infer<typeof zoomEditsSchema>;
