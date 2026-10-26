import { z } from 'zod';

/**
 * Where a recorded window was at one moment: its top left corner and size in device independent
 * pixels on the desktop. `at` is milliseconds on the main clock.
 */
export const boundsSampleSchema = z.strictObject({
  at: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export type BoundsSample = z.infer<typeof boundsSampleSchema>;

/** Formats one sample as a line for `window-bounds.ndjson`, with the newline. */
export function formatBoundsLine(sample: BoundsSample): string {
  return `${JSON.stringify(sample)}\n`;
}

/**
 * Reads `window-bounds.ndjson`. Like the input log, a crash can leave the last line half written,
 * so a last line that does not parse is dropped. Bad lines elsewhere are skipped. The samples come
 * back in time order.
 */
export function parseBoundsNdjson(text: string): BoundsSample[] {
  const samples: BoundsSample[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = boundsSampleSchema.safeParse(JSON.parse(line));
      if (parsed.success) samples.push(parsed.data);
    } catch {
      // A half written line or noise. Nothing to keep.
    }
  }
  return samples.sort((a, b) => a.at - b.at);
}

/**
 * The window position that applies at `at`: the latest sample at or before it, or the first sample
 * when `at` is earlier than all of them. Samples must be in time order. Returns undefined with none.
 */
export function boundsAt(samples: readonly BoundsSample[], at: number): BoundsSample | undefined {
  let found: BoundsSample | undefined;
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const sample = samples[middle];
    if (sample === undefined) break;
    if (sample.at <= at) {
      found = sample;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found ?? samples[0];
}
