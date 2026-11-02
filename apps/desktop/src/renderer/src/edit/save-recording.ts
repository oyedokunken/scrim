import type { Look } from '../../../shared/settings';

/** Where the re-rendered video goes: over the current file, or beside it as a new one. */
export type SaveMode = 'replace' | 'new';

export type SaveStarted = { ok: true; jobId: string } | { ok: false; message: string };

/**
 * Starts the render of an edited recording. The choice between replacing the video and saving a new
 * one lives here and nowhere else in the page, so the main process can take it over without the
 * screens changing. Until then it goes through the existing export job: `replace` writes over the
 * file with the recording's name, and `new` numbers the name so nothing is overwritten. The
 * recording's own working files are never touched.
 */
export async function saveEditedRecording(
  folder: string,
  look: Look,
  mode: SaveMode,
): Promise<SaveStarted> {
  try {
    const job = await window.scrim.invoke('export:start', {
      folder,
      look,
      collision: mode === 'replace' ? 'replace' : 'number',
    });
    return job === null
      ? { ok: false, message: 'Scrim could not find this recording to render.' }
      : { ok: true, jobId: job.id };
  } catch {
    return { ok: false, message: 'Scrim could not start the render. Try again.' };
  }
}
