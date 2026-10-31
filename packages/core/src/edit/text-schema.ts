import { z } from 'zod';
import { isCleanText, TEXT_COLORS, TEXT_LIMITS, TEXT_SIZES, type TextItem } from './text';

/**
 * One text item in `edits.json`. Strict on purpose: text outside the frame, a backwards span, or
 * anything that looks like markup is rejected, so a damaged file never reaches the renderer.
 */
export const textItemSchema = z
  .strictObject({
    id: z.string().min(1).max(64),
    text: z
      .string()
      .min(1)
      .max(TEXT_LIMITS.maxLength)
      .refine(isCleanText, { message: 'Text must be one line of plain text.' }),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    size: z.enum(TEXT_SIZES),
    color: z.enum(TEXT_COLORS),
    chip: z.boolean(),
  })
  .refine((value) => value.endMs > value.startMs, {
    message: 'A text must end after it starts.',
  }) satisfies z.ZodType<TextItem>;

export const textListSchema = z.array(textItemSchema).max(TEXT_LIMITS.maxItems);
