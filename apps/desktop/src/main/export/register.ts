import { app, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Settings } from '../../shared/settings';
import { resolveFfmpegPaths, runProcess } from '../recording/ffmpeg';
import { realServiceFs } from '../recording/fs-adapter';
import { projectsRoot } from '../recording/projects-folder';
import { createSessionIndex } from '../recording/session-store';
import { exportRecording } from './exporter';
import DrawingWorker from './render-worker?nodeWorker';
import { findLegacyFolders, moveLegacyFolders } from './legacy';
import type { MoveResult } from './legacy';
import { findExistingOutput } from './output-lookup';
import { createPendingRenders } from './pending-renders';
import { loadExportSource } from './source';
import { ExportService } from './service';
import type { StartInput } from './service';

export { autoRender } from './service';

/** What the app shell sees of the export engine. Every method returns a value and never throws. */
export interface ExportApi {
  service: ExportService;
  /** Queues a render of a recording's working folder into the saved destination folder. */
  start: (input: StartInput) => ReturnType<ExportService['start']>;
  cancel: (jobId: string) => void;
  retrySafer: (jobId: string) => ReturnType<ExportService['retrySafer']>;
  retry: (jobId: string) => ReturnType<ExportService['retry']>;
  /** Renders a recording again after an edit: write over the old video, or save a new one. */
  rerender: (folder: string, mode: 'replace' | 'new') => ReturnType<ExportService['rerender']>;
  /** The recordings whose video was unfinished when Scrim last closed. */
  pending: () => Promise<{ folder: string; name: string }[]>;
  resumePending: (folder: string) => ReturnType<ExportService['start']> | undefined;
  dismissPending: (folder: string) => void;
  /** Shows the finished file in the file manager, or opens the working folder of its recording. */
  reveal: (jobId: string, what: 'output' | 'source') => Promise<boolean>;
  legacy: {
    /** How many old working folders sit in the destination folder. */
    count: () => Promise<number>;
    /** Moves them into the projects folder. Never deletes anything it has not copied exactly. */
    move: () => Promise<MoveResult>;
  };
}

export interface RegisterOptions {
  settings: () => Settings;
  log: (message: string) => void;
}

/** The folder that receives finished videos: the saved one, or Videos\Scrim. */
function destination(settings: Settings): string {
  return settings.destinationFolder ?? join(app.getPath('videos'), 'Scrim');
}

/** Where a video goes when the chosen folder refuses it, inside the app's own data. */
export function exportFallbackFolder(): string {
  return join(app.getPath('userData'), 'Exports');
}

/** Working copies for the review screen. Not the person's files: cleaned up on export or discard. */
export function previewFolder(): string {
  return join(app.getPath('userData'), 'cache', 'previews');
}

/**
 * Creates the export engine. Call once after the app is ready, then pass the recording service to
 * `autoRender` so every finished recording becomes one MP4 in the destination folder.
 */
export async function registerExport(options: RegisterOptions): Promise<ExportApi> {
  const pendingFile = join(app.getPath('userData'), 'pending-renders.json');
  const pending = createPendingRenders({
    path: pendingFile,
    fs: {
      read: async (path) => {
        try {
          return await readFile(path, 'utf8');
        } catch {
          return undefined;
        }
      },
      write: (path, text) => writeFile(path, text, 'utf8'),
    },
  });
  await pending.load();
  const paths = resolveFfmpegPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    env: process.env,
  });
  const service = new ExportService({
    run: (request, run) =>
      exportRecording(
        {
          paths,
          run: runProcess,
          log: options.log,
          spawnWorker: () => DrawingWorker({}),
          cores: availableParallelism(),
        },
        request,
        run,
      ),
    settings: options.settings,
    destination: () => destination(options.settings()),
    previewDir: previewFolder,
    fallbackDir: exportFallbackFolder,
    newId: randomUUID,
    log: options.log,
    journal: pending,
    findOutput: async (folder) => {
      const loaded = await loadExportSource(folder);
      if (!loaded.ok) return undefined;
      const dir = destination(options.settings());
      const names = await readdir(dir).catch(() => []);
      const entries = await Promise.all(
        names.map(async (name) => {
          const info = await stat(join(dir, name)).catch(() => undefined);
          return info?.isFile() === true ? { name, modifiedMs: info.mtimeMs } : undefined;
        }),
      );
      return findExistingOutput(
        dir,
        loaded.source.session.name,
        entries.filter((entry) => entry !== undefined),
      );
    },
  });
  const root = (): string =>
    projectsRoot({
      platform: process.platform,
      env: process.env,
      userData: app.getPath('userData'),
    });
  const index = createSessionIndex(join(app.getPath('userData'), 'sessions.json'), realServiceFs);

  return {
    service,
    start: (input) => service.start(input),
    cancel: (jobId) => {
      service.cancel(jobId);
    },
    retrySafer: (jobId) => service.retrySafer(jobId),
    retry: (jobId) => service.retry(jobId),
    rerender: (folder, mode) => service.rerender(folder, mode),
    pending: async () => {
      const found: { folder: string; name: string }[] = [];
      for (const folder of pending.leftover()) {
        const loaded = await loadExportSource(folder);
        // A recording that is gone, or that never closed cleanly, is not offered.
        if (loaded.ok) found.push({ folder, name: loaded.source.session.name });
        else pending.dismiss(folder);
      }
      return found;
    },
    resumePending: (folder) => {
      pending.dismiss(folder);
      return service.start({ folder, collision: 'number' });
    },
    dismissPending: (folder) => {
      pending.dismiss(folder);
    },
    async reveal(jobId, what) {
      const job = service.get(jobId);
      if (job === undefined) return false;
      if (what === 'output') {
        if (job.result === null) return false;
        shell.showItemInFolder(job.result.path);
        return true;
      }
      return (await shell.openPath(job.folder)) === '';
    },
    legacy: {
      count: async () => (await findLegacyFolders(destination(options.settings()))).length,
      move: async () => {
        const found = await findLegacyFolders(destination(options.settings()));
        return moveLegacyFolders(found, {
          projectsRoot: root(),
          moved: async (from, to) => {
            await index.remove(from);
            await index.add(to);
          },
        });
      },
    },
  };
}
