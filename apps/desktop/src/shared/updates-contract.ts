import { z } from 'zod';

/** What an update is, as far as the page needs to show it. The notes are plain text, never HTML. */
const updateInfoSchema = z
  .object({
    version: z.string().min(1).max(64),
    notes: z.string().max(4000),
    /** The download size in bytes, or null when the release does not say. */
    sizeBytes: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type UpdateInfo = z.infer<typeof updateInfoSchema>;

const UPDATE_ERROR_KINDS = [
  'offline',
  'blocked',
  'checksum',
  'signature',
  'not-found',
  'unknown',
] as const;
export type UpdateErrorKind = (typeof UPDATE_ERROR_KINDS)[number];

/**
 * Where the update flow is. Only `ready` means a file is downloaded, and even then nothing is
 * installed until the person chooses to restart.
 */
const updateStateSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('idle') }).strict(),
  z.object({ phase: z.literal('checking') }).strict(),
  z.object({ phase: z.literal('none') }).strict(),
  /** This install cannot update itself, for example a copy run from source or a deb package. */
  z.object({ phase: z.literal('unsupported'), message: z.string().max(300) }).strict(),
  z.object({ phase: z.literal('available'), info: updateInfoSchema }).strict(),
  z
    .object({
      phase: z.literal('downloading'),
      info: updateInfoSchema,
      percent: z.number().min(0).max(100),
    })
    .strict(),
  z.object({ phase: z.literal('ready'), info: updateInfoSchema }).strict(),
  z
    .object({
      phase: z.literal('error'),
      kind: z.enum(UPDATE_ERROR_KINDS),
      message: z.string().max(300),
      nextStep: z.string().max(300),
      /** The update that was found before the failure, so the person can try again. */
      info: updateInfoSchema.optional(),
    })
    .strict(),
]);
export type UpdateState = z.infer<typeof updateStateSchema>;

/** What stops the app from touching the network for an update right now. */
const UPDATE_BLOCKS = ['recording', 'exporting', 'editing'] as const;
export type UpdateBlock = (typeof UPDATE_BLOCKS)[number];

export const updateSnapshotSchema = z
  .object({ state: updateStateSchema, blocked: z.enum(UPDATE_BLOCKS).nullable() })
  .strict();
export type UpdateSnapshot = z.infer<typeof updateSnapshotSchema>;

export const updatesContract = {
  /** The current state, without touching the network. */
  'updates:state': { input: z.void(), output: updateSnapshotSchema },
  /** Looks for a newer version. It does nothing while recording, editing or exporting. */
  'updates:check': { input: z.void(), output: updateSnapshotSchema },
  /** Downloads the update that was found. Only the person's press of Update now calls it. */
  'updates:download': { input: z.void(), output: updateSnapshotSchema },
  /** Quits and installs the downloaded update. Only after the person asked for the restart. */
  'updates:install': { input: z.void(), output: z.void() },
  /** The page tells the main process when the editor is open, because an update must not start then. */
  'app:activity': { input: z.object({ editing: z.boolean() }).strict(), output: z.void() },
} as const;
