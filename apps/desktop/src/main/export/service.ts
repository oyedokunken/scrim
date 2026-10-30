import type { RecordingEvent } from '../recording/types';
import type { Settings } from '../../shared/settings';
import { renderStyleFromSettings } from '../../shared/render-style';
import { saferPreset } from './encoders';
import { cursorPaintFor, micGainFor } from './look';
import type {
  Collision,
  ExportError,
  ExportOutcome,
  ExportProgress,
  ExportRequest,
  ExportSettings,
  ExportSuccess,
} from './types';

const STALL_MS = 90_000;

type JobPhase = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** What the page needs to draw the progress, the result or the error. It carries no path but the result. */
export interface ExportJob {
  id: string;
  /** The working folder of the recording. Main only: never sent to the page. */
  folder: string;
  phase: JobPhase;
  progress: ExportProgress | null;
  result: ExportSuccess | null;
  error: ExportError | null;
  /** True when the job was made by a retry with safer settings. */
  safer: boolean;
  /** True for the working copy made after a recording, which lives in the app's cache. */
  preview: boolean;
}

export type ExportEvent = { type: 'status'; job: ExportJob };

export interface StartInput {
  folder: string;
  fileName?: string | undefined;
  collision?: Collision | undefined;
  settings?: Partial<ExportSettings> | undefined;
  safer?: boolean | undefined;
  /** Render the working copy into the cache folder instead of the person's folder. */
  preview?: boolean | undefined;
  inlineOnly?: boolean | undefined;
}

export interface ExportServiceDeps {
  run: (
    request: ExportRequest,
    options: { signal: AbortSignal; onProgress: (progress: ExportProgress) => void },
  ) => Promise<ExportOutcome>;
  settings: () => Settings;
  /** The folder that receives finished files. */
  destination: () => string;
  /** The app's own cache folder for working copies. Nothing there is the person's file. */
  previewDir: () => string;
  /** The app's own folder for a video the chosen folder refused. */
  fallbackDir?: () => string;
  /** How long a render may go without any progress before it counts as stuck. */
  stallMs?: number;
  newId: () => string;
  log: (message: string) => void;
}

/** The export settings the person has saved: the size of the source, their frame rate and sound choice. */
export function defaultExportSettings(settings: Settings): ExportSettings {
  return {
    preset: 'source',
    fps: settings.frameRate,
    quality: 'medium',
    keepAudio: settings.keepSound,
    micGain: micGainFor(settings.micVolume),
    shadow: settings.backgroundShadow,
  };
}

/**
 * Runs exports one at a time, so a second recording never fights the first for the processor.
 * It owns the jobs, tells listeners about every change, and can cancel or retry with safer
 * settings. The destination and the look always come from the saved settings in the main
 * process, never from the page.
 */
export class ExportService {
  private readonly jobs = new Map<string, ExportJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly inputs = new Map<string, StartInput>();
  private readonly listeners = new Set<(event: ExportEvent) => void>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ExportServiceDeps) {}

  on(listener: (event: ExportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Queues a render. Returns at once with the job, which then changes through `on`. */
  start(input: StartInput): ExportJob {
    const job: ExportJob = {
      id: this.deps.newId(),
      folder: input.folder,
      phase: 'queued',
      progress: null,
      result: null,
      error: null,
      safer: input.safer === true,
      preview: input.preview === true,
    };
    this.jobs.set(job.id, job);
    this.inputs.set(job.id, input);
    this.controllers.set(job.id, new AbortController());
    this.emit(job);
    this.queue = this.queue.then(() => this.runJob(job.id)).catch(() => undefined);
    return { ...job };
  }

  /** The same render again with the software encoder and a smaller size. */
  retrySafer(jobId: string): ExportJob | undefined {
    const input = this.inputs.get(jobId);
    if (input === undefined) return undefined;
    const base = { ...defaultExportSettings(this.deps.settings()), ...input.settings };
    return this.start({
      ...input,
      collision: input.collision === 'replace' ? 'replace' : 'number',
      settings: { ...input.settings, preset: saferPreset(base.preset) },
      safer: true,
    });
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job === undefined || job.phase === 'done' || job.phase === 'failed') return;
    this.controllers.get(jobId)?.abort();
    if (job.phase === 'queued') {
      job.phase = 'cancelled';
      this.emit(job);
    }
  }

  get(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    return job === undefined ? undefined : { ...job };
  }

  /** The most recent job, so a page opened later can show what happened. */
  latest(): ExportJob | undefined {
    const all = [...this.jobs.values()];
    const last = all[all.length - 1];
    return last === undefined ? undefined : { ...last };
  }

  /** True while a render is queued or running. The window should not quit silently then. */
  busy(): boolean {
    return [...this.jobs.values()].some((job) => job.phase === 'queued' || job.phase === 'running');
  }

  private emit(job: ExportJob): void {
    for (const listener of this.listeners) listener({ type: 'status', job: { ...job } });
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    const input = this.inputs.get(jobId);
    const controller = this.controllers.get(jobId);
    if (job === undefined || input === undefined || controller === undefined) return;
    if (job.phase === 'cancelled') return;
    job.phase = 'running';
    this.emit(job);

    const saved = this.deps.settings();
    const preview = input.preview === true;
    const request: ExportRequest = {
      folder: input.folder,
      outputDir: preview ? this.deps.previewDir() : this.deps.destination(),
      ...(this.deps.fallbackDir === undefined || preview
        ? {}
        : { fallbackDir: this.deps.fallbackDir() }),
      fileName: input.fileName,
      collision: preview ? 'replace' : (input.collision ?? 'number'),
      settings: { ...defaultExportSettings(saved), ...input.settings },
      style: renderStyleFromSettings(saved),
      paint: cursorPaintFor(saved.haloColor),
      softwareOnly: input.safer === true,
    };
    let lastEmit = 0;
    let outcome: ExportOutcome;
    const stallMs = this.deps.stallMs ?? STALL_MS;
    // A render that makes no progress for a long time is stuck, not slow. Stop it, and draw on one
    // thread the second time, because a drawing thread that never answers is the usual cause.
    const attempt = async (inline: boolean, signal: AbortSignal, onStall: () => void) => {
      let beat = Date.now();
      let timer: ReturnType<typeof setInterval> | undefined;
      const stuck = new Promise<'stuck'>((resolve) => {
        timer = setInterval(
          () => {
            if (Date.now() - beat > stallMs) resolve('stuck');
          },
          Math.max(10, Math.min(5000, Math.floor(stallMs / 4))),
        );
      });
      try {
        const run = this.deps.run(inline ? { ...request, inlineOnly: true } : request, {
          signal,
          onProgress: (progress) => {
            beat = Date.now();
            job.progress = progress;
            const now = Date.now();
            if (now - lastEmit >= 250 || progress.fraction >= 1) {
              lastEmit = now;
              this.emit(job);
            }
          },
        });
        const first = await Promise.race([run, stuck]);
        if (first === 'stuck') {
          onStall();
          return 'stuck' as const;
        }
        return first;
      } finally {
        clearInterval(timer);
      }
    };
    try {
      let result = await attempt(input.inlineOnly === true, controller.signal, () => {
        controller.abort();
      });
      if (result === 'stuck') {
        this.deps.log('export: no progress, trying again on one thread');
        job.progress = null;
        const second = new AbortController();
        this.controllers.set(jobId, second);
        result = await attempt(true, second.signal, () => {
          second.abort();
        });
      }
      outcome =
        result === 'stuck'
          ? {
              ok: false,
              error: {
                code: 'stalled',
                message: 'Making the video stopped moving, so Scrim stopped it.',
                nextStep:
                  'Try again. If it keeps happening, try with safer settings. Your recording was not changed.',
              },
            }
          : result;
    } catch (error) {
      this.deps.log(
        `export: unexpected failure (${error instanceof Error ? error.name : 'unknown'})`,
      );
      outcome = {
        ok: false,
        error: {
          code: 'unknown',
          message: 'Something went wrong while making the video.',
          nextStep: 'Try again with safer settings. Your recording was not changed.',
        },
      };
    }
    if (outcome.ok) {
      job.phase = 'done';
      job.result = outcome;
      job.progress = null;
    } else if (outcome.error.code === 'cancelled') {
      job.phase = 'cancelled';
    } else {
      job.phase = 'failed';
      job.error = outcome.error;
      this.deps.log(`export: failed with ${outcome.error.code}`);
    }
    this.emit(job);
  }
}

/** Renders every finished recording, including a recovered one, with the saved settings. */
export function autoRender(
  recording: { on: (listener: (event: RecordingEvent) => void) => () => void },
  service: Pick<ExportService, 'start'>,
): () => void {
  return recording.on((event) => {
    if (event.type === 'finished') service.start({ folder: event.result.folder, preview: true });
  });
}
