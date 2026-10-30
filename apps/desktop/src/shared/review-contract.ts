import { z } from 'zod';
import { outcome, pathSchema } from './recording-contract';

const mediaUrl = z.string().max(256).startsWith('scrim-media://p/');

/**
 * What the review screen shows after a recording: the raw recording and the working copy with every
 * effect, as addresses the page can play, and the facts about both. It holds no path except the
 * name of the folder the final video will go to.
 */
const reviewSchema = z
  .object({
    name: z.string().max(260),
    createdAt: z.string().max(40),
    durationMs: z.number().nonnegative(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    fps: z.number().nonnegative().nullable(),
    rawBytes: z.number().nonnegative(),
    previewBytes: z.number().nonnegative().nullable(),
    before: mediaUrl,
    /** Null until the working copy has been made. */
    after: mediaUrl.nullable(),
    outputFolder: z.string().max(1024),
  })
  .strict();

export type ReviewView = z.infer<typeof reviewSchema>;

/** The review calls. The folder must be one Scrim itself made. */
export const reviewContract = {
  'review:open': {
    input: z.object({ folder: pathSchema }).strict(),
    output: outcome(reviewSchema),
  },
  /** Moves the recording to the Recycle Bin and removes its working copy. */
  'review:discard': {
    input: z.object({ folder: pathSchema }).strict(),
    output: outcome(z.void()),
  },
} as const;
