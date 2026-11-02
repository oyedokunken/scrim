import type { Look } from '../../shared/settings';
import { basename, dirname } from 'node:path';
import type { ExportJobView, PendingRender } from '../../shared/export-contract';
import type { Handlers } from '../ipc/dispatcher';
import type { ExportJob, StartInput } from './service';

/** What the handlers use of the export engine, so tests supply a fake. */
export interface ExportLike {
  start: (input: StartInput) => ExportJob;
  cancel: (jobId: string) => void;
  retrySafer: (jobId: string) => ExportJob | undefined;
  retry: (jobId: string) => ExportJob | undefined;
  rerender: (folder: string, mode: 'replace' | 'new', look?: Look) => Promise<ExportJob>;
  /** Recordings whose video was unfinished when Scrim last closed, and the calls that settle them. */
  pending: () => Promise<PendingRender[]>;
  resumePending: (folder: string) => ExportJob | undefined;
  dismissPending: (folder: string) => void;
  latest: () => ExportJob | undefined;
  reveal: (jobId: string, what: 'output' | 'source') => Promise<boolean>;
}

/** A job as the page may see it: no folder, and the finished file by name only. */
export function toBridgeJob(job: ExportJob): ExportJobView {
  return {
    id: job.id,
    preview: job.preview,
    recording: basename(job.folder),
    phase: job.phase,
    progress:
      job.progress === null
        ? null
        : {
            frame: job.progress.frame,
            totalFrames: job.progress.totalFrames,
            fraction: Math.min(1, Math.max(0, job.progress.fraction)),
            etaMs: job.progress.etaMs,
            speed: job.progress.speed,
          },
    result:
      job.result === null
        ? null
        : {
            fileName: basename(job.result.path),
            durationMs: job.result.durationMs,
            bytes: job.result.bytes,
            encoder: job.result.encoder,
            note: job.result.note,
            fellBack: job.result.fellBack,
            savedIn: dirname(job.result.path),
          },
    error:
      job.error === null
        ? null
        : {
            code: job.error.code,
            message: job.error.message,
            nextStep: job.error.nextStep,
            ...(job.error.stderrTail === undefined ? {} : { stderrTail: job.error.stderrTail }),
          },
    safer: job.safer,
  };
}

/** The choices that were made. A zod optional can hold undefined, which the engine must not see. */
function definedOnly(settings: object): NonNullable<StartInput['settings']> {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
}

type ExportHandlers = Pick<
  Handlers,
  | 'export:start'
  | 'export:cancel'
  | 'export:retry-safer'
  | 'export:retry'
  | 'export:latest'
  | 'export:reveal'
  | 'export:rerender'
  | 'export:pending'
  | 'export:resume-pending'
  | 'export:dismiss-pending'
>;

/** The export calls. A render starts only for a folder Scrim made, and the destination is never the page's. */
export function createExportHandlers(deps: {
  exporter: ExportLike;
  isKnownFolder: (folder: string) => boolean;
}): ExportHandlers {
  const { exporter } = deps;
  return {
    'export:start': (input) => {
      if (!deps.isKnownFolder(input.folder)) return null;
      return toBridgeJob(
        exporter.start({
          folder: input.folder,
          ...(input.fileName === undefined ? {} : { fileName: input.fileName }),
          ...(input.collision === undefined ? {} : { collision: input.collision }),
          ...(input.preview === true ? { preview: true } : {}),
          ...(input.settings === undefined ? {} : { settings: definedOnly(input.settings) }),
        }),
      );
    },
    'export:cancel': ({ jobId }) => {
      exporter.cancel(jobId);
    },
    'export:retry-safer': ({ jobId }) => {
      const job = exporter.retrySafer(jobId);
      return job === undefined ? null : toBridgeJob(job);
    },
    'export:retry': ({ jobId }) => {
      const job = exporter.retry(jobId);
      return job === undefined ? null : toBridgeJob(job);
    },
    'export:rerender': async ({ folder, mode, look }) => {
      if (!deps.isKnownFolder(folder)) return null;
      return toBridgeJob(await exporter.rerender(folder, mode, look));
    },
    'export:pending': () => exporter.pending(),
    'export:resume-pending': ({ folder }) => {
      if (!deps.isKnownFolder(folder)) return null;
      const job = exporter.resumePending(folder);
      return job === undefined ? null : toBridgeJob(job);
    },
    'export:dismiss-pending': ({ folder }) => {
      exporter.dismissPending(folder);
    },
    'export:latest': () => {
      const job = exporter.latest();
      return job === undefined ? null : toBridgeJob(job);
    },
    'export:reveal': ({ jobId, what }) => exporter.reveal(jobId, what),
  };
}
