import { z } from 'zod';

/** What the About card shows about the app. Every value comes from the installed build. */
export const aboutSchema = z
  .object({
    name: z.string().min(1).max(64),
    version: z.string().min(1).max(64),
    license: z.string().min(1).max(32),
    /** The day this build was made, as YYYY-MM-DD. Null when the build did not record one. */
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    /** When the installed program file last changed, as an ISO time. Null when it cannot be read. */
    lastUpdated: z.string().max(40).nullable(),
  })
  .strict();
export type About = z.infer<typeof aboutSchema>;

/**
 * The computer's name and system. They are read on demand for the About card and are never sent
 * anywhere, never stored and never written to the log.
 */
export const systemInfoSchema = z
  .object({
    computerName: z.string().max(255),
    operatingSystem: z.string().max(200),
  })
  .strict();
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const aboutContract = {
  'app:about': { input: z.void(), output: aboutSchema },
  'system:info': { input: z.void(), output: systemInfoSchema },
} as const;
