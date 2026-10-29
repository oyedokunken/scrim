import { editListSchema, sessionFileSchema, sessionLogSchema } from '@scrim/core';
import { z } from 'zod';
import { outcome, pathSchema } from './recording-contract';

/** The edits as the editor holds them: an edit list without its version, which the main process adds. */
const editsSchema = editListSchema.omit({ version: true });

/**
 * An address the page plays a track from. It holds an opaque token and never a path. The protocol that
 * serves these is not registered yet, so until it is the editor cannot play the media.
 */
const mediaUrl = z.string().max(256).startsWith('scrim-media://p/');

const projectSchema = z
  .object({
    name: z.string(),
    /** Every time counts from the first screen frame. */
    session: sessionFileSchema,
    log: sessionLogSchema.nullable(),
    edits: editsSchema,
    media: z
      .object({ screen: mediaUrl, camera: mediaUrl.optional(), mic: mediaUrl.optional() })
      .strict(),
  })
  .strict();

/** The editor calls. The folder must be one Scrim itself offered: a recording, the library or recovery. */
export const editorContract = {
  'editor:open': {
    input: z.object({ folder: pathSchema }).strict(),
    output: outcome(projectSchema),
  },
  'editor:save-edits': {
    input: z.object({ folder: pathSchema, edits: editsSchema }).strict(),
    output: outcome(z.void()),
  },
} as const;
