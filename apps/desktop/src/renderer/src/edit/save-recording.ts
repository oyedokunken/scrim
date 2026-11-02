import type { Look } from '../../../shared/settings';

/** Where the re-rendered video goes: over the current file, or beside it as a new one. */
export type SaveMode = 'replace' | 'new';

export type SaveStarted = { ok: true; jobId: string } | { ok: false; message: string };

/**
 * Starts the render of an edited recording through the same call Stop uses to make the one video, so
 * a recording never gets a second numbered file by accident. `replace` writes over the video it made
 * before, `new` saves another beside it, and anything still rendering for it is stopped first. The
 * look rides along for this render only. The recording's own working files are never touched.
 */
export async function saveEditedRecording(
  folder: string,
  look: Look,
  mode: SaveMode,
): Promise<SaveStarted> {
  try {
    const job = await window.scrim.invoke('export:rerender', { folder, mode, look });
    return job === null
      ? { ok: false, message: 'Scrim could not find this recording to render.' }
      : { ok: true, jobId: job.id };
  } catch {
    return { ok: false, message: 'Scrim could not start the render. Try again.' };
  }
}
