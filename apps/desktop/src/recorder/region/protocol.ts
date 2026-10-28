import { z } from 'zod';

/** Channel names for the region overlay windows. Main sends commands. The pages send events. */
export const REGION_CHANNELS = {
  command: 'scrim-region:command',
  event: 'scrim-region:event',
} as const;

/** Another display's overlay started a box, so this one drops any box it has drawn. */
export type RegionCommand = { type: 'clear' };

const rect = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** What an overlay page may tell main. Strict, and checked in main before anything is used. */
export const regionEventSchema = z.discriminatedUnion('type', [
  /** The page has loaded and is showing. */
  z.strictObject({ type: z.literal('ready') }),
  /** The person began drawing a box here. */
  z.strictObject({ type: z.literal('begin') }),
  /** Enter was pressed with this box, in device independent pixels on this display. */
  z.strictObject({ type: z.literal('confirm'), rect }),
  /** Escape was pressed. */
  z.strictObject({ type: z.literal('cancel') }),
]);
