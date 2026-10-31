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

type OpenResult = { ok: true; project: EditorProject } | { ok: false; message: string };
type SaveResult = { ok: true } | { ok: false; message: string };

/** One export as the page sees it. It carries no path. */
export interface ExportView {
  id: string;
  phase: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  /** 0 to 1 while running, null before a speed is known. */
  fraction: number | null;
  etaMs: number | null;
  /** Plain words for a failure, with what to do next. */
  message?: string | undefined;
  /** The last lines of the encoder output, behind a Details button. */
  detail?: string | undefined;
  /** The finished file's name. */
  fileName?: string | undefined;
  /** The finished file's size, length and whether it landed in the app's own folder. */
  bytes?: number | undefined;
  durationMs?: number | undefined;
  fellBack?: boolean | undefined;
}

type StartExportResult = { ok: true; jobId: string } | { ok: false; message: string };

/** The export calls the editor makes. The shell maps EXPORT's channels to these. */
export interface ExportControls {
  start(folder: string): Promise<StartExportResult>;
  cancel(jobId: string): void;
  /** The same render again with the software encoder and a smaller size. */
  retrySafer(jobId: string): void;
  reveal(jobId: string, what: 'output' | 'source'): void;
  /** Calls the listener for every change of any job. Returns a function that stops it. */
  subscribe(listener: (job: ExportView) => void): () => void;
}

/** What the editor needs from the app. The shell maps `window.scrim` to this. */
export interface EditorApi {
  open(folder: string): Promise<OpenResult>;
  /** Writes `edits.json` beside the recording. The recording itself is never touched. */
  saveEdits(folder: string, edits: Edits): Promise<SaveResult>;
  /** Present once the shell wires the export channels. Without it there is no export panel. */
  exporter?: ExportControls | undefined;
}
