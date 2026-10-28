import { app, BrowserWindow, dialog, shell } from 'electron';
import { join } from 'node:path';
import { createLogger, type Logger } from '../log/logger';
import { realLoggerFs } from '../log/real-logger-fs';
import { openExternalChecked } from '../external-opener';
import { realSettingsFs } from '../settings/real-settings-fs';
import { createSettingsStore, type SettingsStore } from '../settings/settings-store';
import type { AreaApi } from './area-handlers';
import { createHandlers } from './handlers';
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
}): Promise<SettingsStore> {
  const { appOrigin, logger, recording, area } = options;

  const settings = createSettingsStore({
    path: join(app.getPath('userData'), 'settings.json'),
    fs: realSettingsFs,
    onChange: (next) => {
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
      recording,
      area,
      screenshotFolder: () => join(app.getPath('pictures'), 'Scrim'),
      extraKnownFolders: () => [...sessionFolders],
      platform: process.platform,
      chooseFolder: async () => {
        const parent = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
          properties: ['openDirectory', 'createDirectory'] as (
            'openDirectory' | 'createDirectory'
          )[],
          defaultPath: settings.get().destinationFolder ?? app.getPath('videos'),
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
    }),
    // Only the failure kind and the channel name, never the input or the error text.
    onFailure: (failure, channel) => {
      logger.warn('ipc.rejected', { failure, channel });
    },
  });
  return settings;
}
