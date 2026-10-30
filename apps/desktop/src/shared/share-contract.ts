import { z } from 'zod';
import { pathSchema } from './recording-contract';

/** A video larger than this gets a warning, because many apps and mail services cap attachments. */
export const LARGE_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * What is being shared. The page never sends a path of its own: a library item is named by the id
 * of the last listing, a recording under review by its working folder, and an edited screenshot
 * by the picture itself.
 */
const shareSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('library'), id: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal('review'), folder: pathSchema }).strict(),
  z
    .object({
      kind: z.literal('edited'),
      dataUrl: z.string().max(80_000_000).startsWith('data:image/png;base64,'),
      name: z.string().min(1).max(120),
    })
    .strict(),
]);
export type ShareSource = z.infer<typeof shareSourceSchema>;

const SHARE_ACTIONS = [
  'app',
  'copy-file',
  'copy-image',
  'email',
  'reveal',
  'copy-path',
  'smaller',
] as const;
export type ShareAction = (typeof SHARE_ACTIONS)[number];

const infoSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      name: z.string(),
      media: z.enum(['video', 'image']),
      bytes: z.number().nonnegative(),
      /** A video over 25 MB. */
      large: z.boolean(),
      /** Which actions this computer and this file can do. */
      can: z
        .object({
          app: z.boolean(),
          copyFile: z.boolean(),
          copyImage: z.boolean(),
          email: z.boolean(),
          reveal: z.boolean(),
          drag: z.boolean(),
          smaller: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ ok: z.literal(false), reason: z.enum(['missing', 'not-ready']), message: z.string() })
    .strict(),
]);

const runSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), message: z.string() }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['missing', 'not-ready', 'unsupported', 'failed']),
      message: z.string(),
    })
    .strict(),
]);

export const shareContract = {
  'share:info': { input: z.object({ source: shareSourceSchema }).strict(), output: infoSchema },
  'share:run': {
    input: z.object({ source: shareSourceSchema, action: z.enum(SHARE_ACTIONS) }).strict(),
    output: runSchema,
  },
  /** Starts dragging the file out of the window, for the preview and the cards. */
  'share:drag': { input: z.object({ source: shareSourceSchema }).strict(), output: z.void() },
} as const;
