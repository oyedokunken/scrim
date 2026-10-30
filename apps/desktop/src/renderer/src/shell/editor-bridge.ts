import type { EditorApi, ExportControls, ExportView } from '../editor/editor-api';
import type { ExportJobView } from '../hooks';

function words(error: { message: string; nextStep: string }): string {
  return `${error.message} ${error.nextStep}`;
}

/** A job as the export panel draws it. */
function toExportView(job: ExportJobView): ExportView {
  return {
    id: job.id,
    phase: job.phase,
    fraction: job.progress?.fraction ?? null,
    etaMs: job.progress?.etaMs ?? null,
    ...(job.error === null ? {} : { message: `${job.error.message} ${job.error.nextStep}` }),
    ...(job.error?.stderrTail === undefined ? {} : { detail: job.error.stderrTail }),
    ...(job.result === null ? {} : { fileName: job.result.fileName }),
  };
}

const exporter: ExportControls = {
  async start(folder) {
    try {
      const job = await window.scrim.invoke('export:start', { folder });
      return job === null
        ? { ok: false, message: 'Scrim could not find this recording to export.' }
        : { ok: true, jobId: job.id };
    } catch {
      return { ok: false, message: 'Scrim could not start the export. Try again.' };
    }
  },
  cancel(jobId) {
    void window.scrim.invoke('export:cancel', { jobId }).catch(() => undefined);
  },
  retrySafer(jobId) {
    void window.scrim.invoke('export:retry-safer', { jobId }).catch(() => undefined);
  },
  reveal(jobId, what) {
    void window.scrim.invoke('export:reveal', { jobId, what }).catch(() => undefined);
  },
  subscribe(listener) {
    return window.scrim.on('export:status', (job) => {
      listener(toExportView(job));
    });
  },
};

/**
 * Maps the editor's view of the app onto the typed bridge. A failure becomes plain words for the page,
 * never a thrown error. The export panel works through the export channels.
 */
export const editorApi: EditorApi = {
  exporter,
  async open(folder) {
    try {
      const result = await window.scrim.invoke('editor:open', { folder });
      return result.ok
        ? { ok: true, project: result.value }
        : { ok: false, message: words(result.error) };
    } catch {
      return { ok: false, message: 'Scrim could not open this recording. Try again.' };
    }
  },
  async saveEdits(folder, edits) {
    try {
      const result = await window.scrim.invoke('editor:save-edits', { folder, edits });
      return result.ok ? { ok: true } : { ok: false, message: words(result.error) };
    } catch {
      return { ok: false, message: 'Scrim could not save your edits. Try again.' };
    }
  },
};
