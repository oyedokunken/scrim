import { z } from 'zod';

/** A path that crosses the bridge. The main process decides which paths it will accept. */
export const pathSchema = z.string().min(1).max(1024);

const cropSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

/** What to record: the whole display, a box on a display, or one window. */
export const sourceSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('display'), displayId: z.string().min(1).max(64).optional() })
    .strict(),
  z
    .object({
      kind: z.literal('region'),
      displayId: z.string().min(1).max(64).optional(),
      crop: cropSchema,
    })
    .strict(),
  z.object({ kind: z.literal('window'), sourceId: z.string().min(1).max(256) }).strict(),
]);

export const deviceSchema = z
  .object({ enabled: z.boolean(), deviceId: z.string().min(1).max(512).optional() })
  .strict();

/**
 * A failure in words a person can read. The engine also has a technical `detail` for the log, and it
 * is left out here on purpose, because it can hold a file path or an error number.
 */
export const recordingErrorSchema = z
  .object({
    code: z.enum([
      'invalid-state',
      'disk-too-full',
      'disk-full',
      'folder-not-writable',
      'saved-elsewhere',
      'folder-unavailable',
      'write-failed',
      'screen-permission',
      'screen-unavailable',
      'display-removed',
      'recorder-failed',
      'recorder-crashed',
      'ffmpeg-missing',
      'remux-failed',
      'nothing-recoverable',
      'unknown',
    ]),
    message: z.string().max(500),
    nextStep: z.string().max(500),
  })
  .strict();

export const warningSchema = z
  .object({
    code: z.enum([
      'disk-low',
      'camera-lost',
      'mic-lost',
      'camera-unavailable',
      'mic-unavailable',
      'input-unavailable',
      'writer-slow',
    ]),
    message: z.string().max(500),
    freeBytes: z.number().nonnegative().optional(),
  })
  .strict();

export const snapshotSchema = z
  .object({
    phase: z.enum(['idle', 'starting', 'recording', 'paused', 'stopping', 'stopped', 'failed']),
    elapsedMs: z.number().nonnegative(),
    bytesWritten: z.number().nonnegative(),
    tracks: z.array(
      z
        .object({
          kind: z.enum(['screen', 'camera', 'mic']),
          bytesWritten: z.number().nonnegative(),
          ended: z.boolean(),
        })
        .strict(),
    ),
    warnings: z.array(warningSchema),
  })
  .strict();

export const finishedSchema = z
  .object({
    folder: pathSchema,
    name: z.string().max(200),
    files: z.array(
      z.object({ kind: z.enum(['screen', 'camera', 'mic']), path: pathSchema }).strict(),
    ),
    durationMs: z.number().nonnegative(),
    bytes: z.number().nonnegative(),
    inputLog: pathSchema.optional(),
    recovered: z.boolean(),
    warnings: z.array(z.string().max(500)),
  })
  .strict();

export const recoverableSchema = z
  .object({
    folder: pathSchema,
    name: z.string().max(200),
    createdAt: z.string().max(64),
    bytes: z.number().nonnegative(),
  })
  .strict();

/** Every recording call answers with a value or an error, and never throws across the bridge. */
export const outcome = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }).strict(),
    z.object({ ok: z.literal(false), error: recordingErrorSchema }).strict(),
  ]);

export const recordingNameSchema = z.string().min(1).max(200);

const screenshotResultSchema = z
  .object({
    path: pathSchema.optional(),
    /** Set when the picture could not be saved to the folder, such as when Windows protects it. */
    saveError: z
      .object({
        code: z.string().max(64).optional(),
        message: z.string().max(500),
        nextStep: z.string().max(500),
      })
      .strict()
      .optional(),
    copied: z.boolean(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

/**
 * What the area chooser did. A cancelled overlay is an answer, not an error, so the page shows
 * nothing for it. Where the files go comes from the main process, never from the page.
 */
export const areaOutcomeSchema = z.union([
  z.object({ ok: z.literal(true), mode: z.literal('record') }).strict(),
  z
    .object({ ok: z.literal(true), mode: z.literal('screenshot'), result: screenshotResultSchema })
    .strict(),
  z.object({ ok: z.literal(false), reason: z.enum(['cancelled', 'busy']) }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.literal('failed'),
      /** Where the chooser failed, as a short code. It never holds a path. */
      step: z
        .enum(['no-displays', 'overlay-not-ready', 'overlay-open', 'nothing-confirmed'])
        .optional(),
    })
    .strict(),
  z
    .object({ ok: z.literal(false), reason: z.literal('rejected'), error: recordingErrorSchema })
    .strict(),
]);

export const areaRequestSchema = z
  .object({
    mode: z.enum(['record', 'screenshot']),
    area: z.enum(['region', 'window', 'display']).optional(),
    camera: deviceSchema,
    mic: deviceSchema,
    name: recordingNameSchema.optional(),
  })
  .strict();
