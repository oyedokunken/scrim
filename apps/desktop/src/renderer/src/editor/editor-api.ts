import type { SessionFile, SessionLog } from '@scrim/core';
import type { Edits } from './edits';

/** A recording opened in the editor. Every time counts from the first screen frame. */
export interface EditorProject {
  name: string;
  session: SessionFile;
  /** The mouse log, or null when the mouse could not be logged. */
  log: SessionLog | null;
  edits: Edits;
  /** Where the page plays each track from. Never a file path. */
  media: { screen: string; camera?: string | undefined; mic?: string | undefined };
}

export type OpenResult = { ok: true; project: EditorProject } | { ok: false; message: string };
export type SaveResult = { ok: true } | { ok: false; message: string };

/** What the editor needs from the app. The shell maps `window.scrim` to this. */
export interface EditorApi {
  open(folder: string): Promise<OpenResult>;
  /** Writes `edits.json` beside the recording. The recording itself is never touched. */
  saveEdits(folder: string, edits: Edits): Promise<SaveResult>;
}
