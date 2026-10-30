import { app, BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, shell } from 'electron';
import { screenshotFallbackFolder } from '../recording/screenshot-taker';
import { createRealShare } from '../share/share';
import { access, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventPayload } from '../../shared/ipc-contract';
import { findLegacyFolders, moveLegacyFolders } from '../export/legacy';
import { createSessionIndex } from '../recording/session-store';
import type { ShortcutId } from '../../shared/shortcut-keys';
import type { Settings } from '../../shared/settings';
import { loadExportSource } from '../export/source';
import { isInsideKnownFolder } from './handlers';
import { realServiceFs } from '../recording/fs-adapter';
import { projectsRoot } from '../recording/projects-folder';
import { exportFallbackFolder, previewFolder, type ExportApi } from '../export/register';
import type { MediaRegistry } from '../media/media-registry';
import { probeFile, resolveFfmpegPaths, runProcess } from '../recording/ffmpeg';
import { createReviewHandlers } from '../review/review-handlers';
import { toBridgeJob } from '../export/export-handlers';
import { createRealLibrary } from '../library/real-library';
import { createLogger, type Logger } from '../log/logger';
import { realLoggerFs } from '../log/real-logger-fs';
import { openExternalChecked } from '../external-opener';
import { realSettingsFs } from '../settings/real-settings-fs';
import { createSettingsStore, type SettingsStore } from '../settings/settings-store';
import type { AreaApi } from './area-handlers';
import { createHandlers, screenshotFolderOf } from './handlers';
import type { RecordingEvent } from '../recording/types';
import { toBridgeEvent, type RecordingApi } from './recording-handlers';
import { registerIpc, sendEvent } from './register';

/** What the app shell needs from the recording service: the calls, and its events. */
export type AppRecording = RecordingApi & {
  on: (listener: (event: RecordingEvent) => void) => () => void;
};

/** The local log, in the system logs folder. Lines are cleaned of paths before they are written. */
export function createAppLogger(): Logger {
  return createLogger({
    dir: app.getPath('logs'),
    fs: realLoggerFs,
    home: app.getPath('home'),
  });
}

/**
 * Loads the settings and registers every IPC channel. Call it before the first window loads, so
 * the page can ask for its settings as soon as it starts.
 */
export async function startIpc(options: {
  appOrigin: string;
  logger: Logger;
  recording: AppRecording;
  area: AreaApi;
  /** Called after a setting was saved, so the shortcuts can follow the new keys. */
  onSettingsChanged?: (settings: Settings) => void;
  shortcutStatus: () => readonly ShortcutId[];
  shortcutsSuspend: (suspended: boolean) => void;
  /** The export engine. Its status changes go to every window. */
  exporter: ExportApi;
  /** The files the page may play, shared with the media protocol. */
  media: MediaRegistry;
  closeAnswer: (answer: 'shown' | 'keep' | 'stop' | 'cancel') => void;
}): Promise<SettingsStore> {
  const { appOrigin, logger, recording, area } = options;

  const share = createRealShare();
  const settings = createSettingsStore({
    path: join(app.getPath('userData'), 'settings.json'),
    fs: realSettingsFs,
    onChange: (next) => {
      options.onSettingsChanged?.(next);
      for (const window of BrowserWindow.getAllWindows()) {
        sendEvent(window.webContents, appOrigin, 'settings:changed', next);
      }
    },
    log: (event, fields) => {
      logger.warn(event, fields);
    },
  });
  await settings.load();

  // Folders the engine has written to this run, so a finished recording can be shown in its folder.
  const sessionFolders = new Set<string>();

  const isKnownFolder = (folder: string): boolean =>
    folder.endsWith('.scrim') &&
    isInsideKnownFolder(
      folder,
      [
        projectsRoot({
          platform: process.platform,
          env: process.env,
          userData: app.getPath('userData'),
        }),
        settings.get().destinationFolder ?? join(app.getPath('videos'), 'Scrim'),
        ...sessionFolders,
      ],
      process.platform,
    );
  const ffmpegPaths = resolveFfmpegPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    env: process.env,
  });
  const review = createReviewHandlers({
    loadSource: loadExportSource,
    isKnownFolder,
    previewDir: previewFolder,
    outputFolder: () => settings.get().destinationFolder ?? join(app.getPath('videos'), 'Scrim'),
    fileSize: async (file) => {
      try {
        return (await stat(file)).size;
      } catch {
        return undefined;
      }
    },
    probe: (file) => probeFile(runProcess, ffmpegPaths, file),
    issueMedia: (file, label) => options.media.issue(file, label),
    forgetMedia: (file) => {
      options.media.forget(file);
    },
    trash: (path) => shell.trashItem(path),
    remove: (file) => rm(file, { force: true }),
  });
  // The working copy is not the person's file: once the real export is done it has no use.
  options.exporter.service.on((event) => {
    if (event.job.phase === 'done' && !event.job.preview) void review.cleanup(event.job.folder);
  });

  // Every change of an export goes to every window, without the folder or the path.
  options.exporter.service.on((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      sendEvent(window.webContents, appOrigin, 'export:status', toBridgeJob(event.job));
    }
  });

  // Every engine event goes to every window of ours, after it has been checked against the contract.
  recording.on((event) => {
    const mapped = toBridgeEvent(event);
    if (mapped.channel === 'recording:finished') sessionFolders.add(mapped.payload.folder);
    for (const window of BrowserWindow.getAllWindows()) {
      const contents = window.webContents;
      switch (mapped.channel) {
        case 'recording:state':
          sendEvent(contents, appOrigin, mapped.channel, mapped.payload);
          break;
        case 'recording:warning':
          sendEvent(contents, appOrigin, mapped.channel, mapped.payload);
          break;
        case 'recording:error':
          sendEvent(contents, appOrigin, mapped.channel, mapped.payload);
          break;
        case 'recording:finished':
          sendEvent(contents, appOrigin, mapped.channel, mapped.payload);
          break;
      }
    }
  });

  registerIpc({
    allowedOrigin: appOrigin,
    handlers: createHandlers({
      settings,
      share,
      shortcutStatus: options.shortcutStatus,
      exporter: {
        start: (input) => options.exporter.start(input),
        cancel: (jobId) => {
          options.exporter.cancel(jobId);
        },
        retrySafer: (jobId) => options.exporter.retrySafer(jobId),
        latest: () => options.exporter.service.latest(),
        reveal: (jobId, what) => options.exporter.reveal(jobId, what),
      },
      shortcutsSuspend: options.shortcutsSuspend,
      closeAnswer: options.closeAnswer,
      legacy: {
        count: async () =>
          (
            await findLegacyFolders(
              settings.get().destinationFolder ?? join(app.getPath('videos'), 'Scrim'),
            )
          ).length,
        move: async () => {
          const found = await findLegacyFolders(
            settings.get().destinationFolder ?? join(app.getPath('videos'), 'Scrim'),
          );
          const sessions = createSessionIndex(
            join(app.getPath('userData'), 'sessions.json'),
            realServiceFs,
          );
          return moveLegacyFolders(found, {
            projectsRoot: projectsRoot({
              platform: process.platform,
              env: process.env,
              userData: app.getPath('userData'),
            }),
            moved: async (from, to) => {
              await sessions.remove(from);
              await sessions.add(to);
            },
          });
        },
      },
      editor: {
        loadSource: loadExportSource,
        writeEdits: (folder, edits) =>
          realServiceFs.writeJsonAtomic(join(folder, 'edits.json'), edits),
        isKnownFolder,
        issueMedia: (file, label) => options.media.issue(file, label),
      },
      review: review.handlers,
      library: createRealLibrary({
        videosFolder: () =>
          settings.get().destinationFolder ?? join(app.getPath('videos'), 'Scrim'),
        screenshotsFolder: () =>
          screenshotFolderOf(settings.get(), join(app.getPath('pictures'), 'Scrim')),
        extraScreenshotsFolder: screenshotFallbackFolder,
        extraVideosFolder: exportFallbackFolder,
        share,
      }),
      recording,
      area,
      extraScreenshotFolders: () => [screenshotFallbackFolder()],
      defaultScreenshotFolder: () => join(app.getPath('pictures'), 'Scrim'),
      defaultRecordingsFolder: () => join(app.getPath('videos'), 'Scrim'),
      ensureFolder: async (path) => {
        await mkdir(path, { recursive: true });
      },
      images: {
        readFile: (path) => readFile(path),
        // The exclusive flag makes the write fail when the name is taken, so nothing is replaced.
        writeNewFile: (path, data) => writeFile(path, data, { flag: 'wx' }),
        writeChosenFile: (path, data) => writeFile(path, data),
        exists: (path) =>
          access(path).then(
            () => true,
            () => false,
          ),
        copyImage: (png) => {
          void clipboard.write([
            new ClipboardItem({
              'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
            }),
          ]);
        },
        chooseSavePath: async (defaultName) => {
          const options = {
            defaultPath: join(app.getPath('pictures'), defaultName),
            filters: [{ name: 'PNG image', extensions: ['png'] }],
          };
          const parent = BrowserWindow.getFocusedWindow();
          const result = parent
            ? await dialog.showSaveDialog(parent, options)
            : await dialog.showSaveDialog(options);
          return result.canceled ? null : result.filePath;
        },
        startDrag: (path) => {
          const window = BrowserWindow.getFocusedWindow();
          if (!window) return;
          window.webContents.startDrag({
            file: path,
            icon: nativeImage.createFromPath(path).resize({ width: 128 }),
          });
        },
        trash: (path) => shell.trashItem(path),
        listFolder: async (folder) => {
          let names: string[];
          try {
            names = await readdir(folder);
          } catch {
            return [];
          }
          const stats = await Promise.all(
            names.map(async (name) => {
              try {
                const info = await stat(join(folder, name));
                return info.isFile() ? { name, modifiedMs: info.mtimeMs, bytes: info.size } : null;
              } catch {
                return null;
              }
            }),
          );
          return stats.filter((entry) => entry !== null);
        },
        readHead: async (path, bytes) => {
          const handle = await open(path, 'r');
          try {
            const buffer = Buffer.alloc(bytes);
            const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
            return buffer.subarray(0, bytesRead);
          } finally {
            await handle.close();
          }
        },
        thumbnail: (path, width) =>
          nativeImage.createFromPath(path).resize({ width, quality: 'good' }).toDataURL(),
      },
      extraKnownFolders: () => [...sessionFolders],
      platform: process.platform,
      chooseFolder: async (startIn) => {
        const parent = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
          properties: ['openDirectory', 'createDirectory'] as (
            'openDirectory' | 'createDirectory'
          )[],
          defaultPath: startIn,
        };
        const result = parent
          ? await dialog.showOpenDialog(parent, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      showItemInFolder: (path) => {
        shell.showItemInFolder(path);
      },
      openPath: (path) => shell.openPath(path),
      openExternal: (url) => openExternalChecked(url),
      version: app.getVersion(),
      logsFolder: logger.directory,
      // A fixed address, never one from the page. Only Windows has this page.
      openSecuritySettings: async () => {
        if (process.platform !== 'win32') return false;
        try {
          await shell.openExternal('windowsdefender://ransomwareprotection');
          return true;
        } catch {
          return false;
        }
      },
    }),
    // Only the failure kind and the channel name, never the input or the error text.
    onFailure: (failure, channel) => {
      logger.warn('ipc.rejected', { failure, channel });
    },
  });
  return settings;
}

/** Tells every window of ours that a screenshot was saved, whether the button or the shortcut took it. */
export function broadcastScreenshotTaken(
  appOrigin: string,
  shot: EventPayload<'screenshot:taken'>,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    sendEvent(window.webContents, appOrigin, 'screenshot:taken', shot);
  }
}

/** Asks every window of ours to show the close question. False when none could take it. */
export function sendCloseRequest(appOrigin: string, trayAvailable: boolean): boolean {
  let sent = false;
  for (const window of BrowserWindow.getAllWindows()) {
    if (sendEvent(window.webContents, appOrigin, 'window:close-requested', { trayAvailable })) {
      sent = true;
    }
  }
  return sent;
}
