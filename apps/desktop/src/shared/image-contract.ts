import { z } from 'zod';
import { pathSchema } from './recording-contract';

export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/** A 4K screenshot is about 25 MB as a PNG and a third more as text, so the ceiling is generous. */
export const MAX_DATA_URL_CHARS = 96 * 1024 * 1024;

export const pngDataUrlSchema = z
  .string()
  .max(MAX_DATA_URL_CHARS)
  .startsWith(PNG_DATA_URL_PREFIX, 'Only PNG images are accepted.');

/**
 * The image calls. The page only ever names a PNG inside the screenshots folder, and the main
 * process checks that again. Where an edited file goes is decided there, never by the page.
 */
export const imageContract = {
  'image:read': { input: z.object({ path: pathSchema }).strict(), output: pngDataUrlSchema },
  'image:save-edited': {
    input: z
      .object({ sourcePath: pathSchema, dataUrl: pngDataUrlSchema, copy: z.boolean() })
      .strict(),
    output: z.object({ path: pathSchema, copied: z.boolean() }).strict(),
  },
  'image:copy': { input: z.object({ dataUrl: pngDataUrlSchema }).strict(), output: z.void() },
  'image:save-as': {
    input: z.object({ dataUrl: pngDataUrlSchema, name: z.string().min(1).max(200) }).strict(),
    output: z.object({ path: pathSchema.nullable() }).strict(),
  },
  'image:drag': { input: z.object({ path: pathSchema }).strict(), output: z.void() },
  'image:delete': { input: z.object({ path: pathSchema }).strict(), output: z.void() },
} as const;
