import { z } from 'zod';

/** The text stored in the `comment` tag of every video Scrim renders, followed by the project id. */
const TAG_PREFIX = 'scrim-project:';

/** The `comment` value that ties a rendered MP4 to the project (the session id) it came from. */
export function projectTag(projectId: string): string {
  return `${TAG_PREFIX}${projectId}`;
}

/** The project id inside a `comment` tag, or null when the tag was not written by Scrim. */
export function projectIdFromTag(tag: string | null | undefined): string | null {
  if (typeof tag !== 'string' || !tag.startsWith(TAG_PREFIX)) return null;
  const id = tag.slice(TAG_PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null;
}

/**
 * `export.json` in a project folder: which video the last render wrote. It is the first link the
 * Library follows, because it survives a renamed video. The video's own tag is the second.
 */
export const exportRecordSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  file: z.string(),
  bytes: z.number(),
  projectId: z.string().optional(),
});

export type ExportRecord = z.infer<typeof exportRecordSchema>;

export function parseExportRecord(text: string | undefined): ExportRecord | null {
  if (text === undefined) return null;
  try {
    const parsed = exportRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
