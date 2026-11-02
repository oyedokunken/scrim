import { z } from 'zod';
import { zoomEditsSchema } from '../zoom/moments-schema';
import { textListSchema } from './text-schema';

const span = z
  .strictObject({ startMs: z.number().nonnegative(), endMs: z.number().nonnegative() })
  .refine((value) => value.endMs > value.startMs, { message: 'A span must end after it starts.' });

/**
 * `edits.json`, version 1: the edits to a recording, kept beside it so the original files are never
 * changed. `trim` keeps one stretch of media time, and `cuts` remove stretches from inside it. All
 * times are media time in milliseconds, with paused time already left out. Phase 2 writes it empty.
 */
export const editListSchema = z.strictObject({
  version: z.literal(1),
  trim: span.nullable(),
  cuts: z.array(span),
  /** The zoom moments the person edited. Absent means the planner decides, an empty list means no zoom. */
  zoom: zoomEditsSchema.optional(),
  /** Text laid over the video. Absent in files saved before text existed, which load as no text. */
  texts: textListSchema.optional(),
});

export type EditList = z.infer<typeof editListSchema>;

/** An edit list with no trim and no cuts: the whole recording, as recorded. */
export function emptyEditList(): EditList {
  return { version: 1, trim: null, cuts: [] };
}

export type EditListProblem =
  | { code: 'cuts-unordered'; index: number }
  | { code: 'cuts-overlap'; index: number }
  | { code: 'past-end'; index: number };

/**
 * Checks that cuts are in order, do not overlap and stay inside the recording and the trim. An
 * empty list of problems means the list can be applied as it is.
 */
export function checkEditList(list: EditList, durationMs: number): EditListProblem[] {
  const problems: EditListProblem[] = [];
  const start = list.trim?.startMs ?? 0;
  const end = Math.min(list.trim?.endMs ?? durationMs, durationMs);
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const [index, cut] of list.cuts.entries()) {
    if (cut.startMs < previousEnd) {
      problems.push({ code: cut.startMs < start ? 'cuts-unordered' : 'cuts-overlap', index });
    }
    if (cut.startMs < start || cut.endMs > end) problems.push({ code: 'past-end', index });
    previousEnd = Math.max(previousEnd, cut.endMs);
  }
  return problems;
}
