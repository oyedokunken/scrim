import { z } from 'zod';
import { pathSchema } from './recording-contract';

const LIBRARY_KINDS = ['recording', 'screenshot'] as const;

const libraryItemSchema = z
  .object({
    /** Names the item in later calls. It is a hash, never a path. */
    id: z.string().min(1).max(64),
    kind: z.enum(LIBRARY_KINDS),
    name: z.string(),
    createdMs: z.number().nonnegative(),
    /** Null for a screenshot, or when the length is not known. */
    durationMs: z.number().nonnegative().nullable(),
    bytes: z.number().nonnegative(),
    /** A recording that still has its working folder, so the editor can open it. */
    canEdit: z.boolean(),
    /** A recording that has an exported MP4 beside it. */
    hasVideo: z.boolean(),
    /** Only an exported video or a screenshot is a file the person can rename or share. */
    isFile: z.boolean(),
  })
  .strict();

export type LibraryItem = z.infer<typeof libraryItemSchema>;

const idInput = z.object({ id: z.string().min(1).max(64) }).strict();

/** What opening an item does: the editor for a recording, the result view for a screenshot. */
const openOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('editor'), folder: pathSchema }).strict(),
  z
    .object({
      kind: z.literal('screenshot'),
      path: pathSchema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .strict(),
  z.object({ kind: z.literal('played') }).strict(),
  z.object({ kind: z.literal('missing') }).strict(),
]);

export const MAX_LIBRARY_ITEMS = 1000;

/** Library calls. The page names an item by the id of the last listing, never by a path. */
export const libraryContract = {
  'library:list': { input: z.void(), output: z.array(libraryItemSchema).max(MAX_LIBRARY_ITEMS) },
  'library:thumbnail': { input: idInput, output: z.string().nullable() },
  'library:open': { input: idInput, output: openOutputSchema },
  'library:rename': {
    input: z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(120) }).strict(),
    output: z
      .object({ ok: z.boolean(), reason: z.enum(['exists', 'invalid', 'failed']).optional() })
      .strict(),
  },
  'library:reveal': { input: idInput, output: z.void() },
  'library:delete': { input: idInput, output: z.void() },
  'library:share': { input: idInput, output: z.void() },
  /** Whether this computer has a share sheet Scrim can open. The Share buttons only show when it does. */
  'share:available': { input: z.void(), output: z.boolean() },
} as const;
