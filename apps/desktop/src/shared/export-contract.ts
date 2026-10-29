import { z } from 'zod';
import { pathSchema } from './recording-contract';

const exportErrorSchema = z
  .object({
    code: z.string().max(40),
    message: z.string().max(500),
    nextStep: z.string().max(500),
    /** The last lines the encoder printed. It can name files, so it is shown and never logged. */
    stderrTail: z.string().max(10_000).optional(),
  })
  .strict();

/** One export as the page sees it. It carries no folder, and the finished file only by name. */
export const exportJobSchema = z
  .object({
    id: z.string().min(1).max(64),
    phase: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
    progress: z
      .object({
        frame: z.number().nonnegative(),
        totalFrames: z.number().nonnegative(),
        fraction: z.number().min(0).max(1),
        etaMs: z.number().nonnegative().nullable(),
        speed: z.number().nonnegative(),
      })
      .strict()
      .nullable(),
    result: z
      .object({
        fileName: z.string().max(260),
        durationMs: z.number().nonnegative(),
        bytes: z.number().nonnegative(),
        encoder: z.string().max(64),
        note: z.string().max(500).nullable(),
      })
      .strict()
      .nullable(),
    error: exportErrorSchema.nullable(),
    safer: z.boolean(),
  })
  .strict();

export type ExportJobView = z.infer<typeof exportJobSchema>;

const jobIdInput = z.object({ jobId: z.string().min(1).max(64) }).strict();

/** The export calls. The destination, the look and the encoder always come from the main process. */
export const exportContract = {
  'export:start': {
    input: z
      .object({
        /** Must be a folder Scrim offered: a finished recording, the library or recovery. */
        folder: pathSchema,
        fileName: z.string().min(1).max(200).optional(),
        collision: z.enum(['number', 'replace', 'fail']).optional(),
        settings: z
          .object({
            preset: z.enum(['source', '720p', '1080p', '1440p', '2160p']).optional(),
            fps: z.union([z.literal(30), z.literal(60)]).optional(),
            quality: z.enum(['low', 'medium', 'high']).optional(),
            keepAudio: z.boolean().optional(),
            micGain: z.number().min(0).max(4).optional(),
            shadow: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    output: exportJobSchema.nullable(),
  },
  'export:cancel': { input: jobIdInput, output: z.void() },
  'export:retry-safer': { input: jobIdInput, output: exportJobSchema.nullable() },
  'export:latest': { input: z.void(), output: exportJobSchema.nullable() },
  'export:reveal': {
    input: z
      .object({ jobId: z.string().min(1).max(64), what: z.enum(['output', 'source']) })
      .strict(),
    output: z.boolean(),
  },
} as const;
