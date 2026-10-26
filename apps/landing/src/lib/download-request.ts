import { z } from 'zod';

export const SYSTEM_VALUES = ['windows', 'macos', 'linux'] as const;
export type SystemValue = (typeof SYSTEM_VALUES)[number];

/**
 * What the download form sends and the server accepts. The browser and the server run this same
 * schema. Extra fields are refused, the name and email are trimmed, and the email is lower cased.
 * `website` is a honeypot: people never see it, so only a bot fills it in.
 */
export const downloadRequestSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'That email address is too long.')
    .pipe(z.email('Enter a valid email address.')),
  os: z.enum(SYSTEM_VALUES, 'Choose your system.'),
  arch: z.enum(['x64', 'arm64']).optional(),
  format: z.enum(['appimage', 'deb']).optional(),
  updatesOptIn: z.boolean().default(false),
  website: z.string().max(200).optional(),
});

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;

/** The first message for each field that failed, keyed by field name. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    messages[field] ??= issue.message;
  }
  return messages;
}

/** What the server answers when a download can start. */
export interface DownloadResponse {
  /** Where to send the visitor: the installer itself, or the Releases page. */
  url: string;
  /** The installer's file name, or an empty string when there is none to name. */
  filename: string;
  /** The version being downloaded, or an empty string when there is no release. */
  version: string;
  /** True when `url` is the installer itself, false when it is the Releases page. */
  direct: boolean;
}
