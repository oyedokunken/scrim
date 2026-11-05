import { z } from 'zod';

/** The prefix of a background id that names one of the person's own images. */
const CUSTOM_BACKGROUND_PREFIX = 'image:';

/** The largest picture Scrim keeps as a background. */
export const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;

/** The most pictures kept at once, so the folder cannot grow without a limit. */
export const MAX_BACKGROUNDS = 24;

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const backgroundSchema = z.object({ id: idSchema, name: z.string().min(1).max(120) }).strict();
export type BackgroundImage = z.infer<typeof backgroundSchema>;

const imageDataUrlSchema = z
  .string()
  .max(Math.ceil((MAX_BACKGROUND_BYTES * 4) / 3) + 64)
  .regex(/^data:image\/(png|jpeg|webp);base64,/, 'Only PNG, JPG and WebP images are accepted.');

/** Why a picture was not added, in words the page can show as they are. */
const addBackgroundOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), background: backgroundSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['cancelled', 'type', 'size', 'limit', 'failed']),
      message: z.string().max(300),
    })
    .strict(),
]);

/**
 * The calls for the person's own background images. The picture is chosen in the system dialog
 * in the main process, so the page never names a path. A copy lives in Scrim's own data folder.
 */
export const backgroundsContract = {
  'backgrounds:list': { input: z.void(), output: z.array(backgroundSchema).max(MAX_BACKGROUNDS) },
  'backgrounds:add': { input: z.void(), output: addBackgroundOutcomeSchema },
  'backgrounds:read': {
    input: z.object({ id: idSchema }).strict(),
    output: imageDataUrlSchema.nullable(),
  },
  'backgrounds:remove': { input: z.object({ id: idSchema }).strict(), output: z.boolean() },
} as const;

/** The id a setting stores for one of the person's images. */
export function customBackgroundId(id: string): string {
  return `${CUSTOM_BACKGROUND_PREFIX}${id}`;
}

/** The image id behind a stored background id, or null for a preset or none. */
export function customBackgroundOf(backgroundId: string): string | null {
  if (!backgroundId.startsWith(CUSTOM_BACKGROUND_PREFIX)) return null;
  const id = backgroundId.slice(CUSTOM_BACKGROUND_PREFIX.length);
  return idSchema.safeParse(id).success ? id : null;
}
