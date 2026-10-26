import { app, BrowserWindow, dialog, shell } from 'electron';
import { join } from 'node:path';
import { createLogger, type Logger } from '../log/logger';
import { realLoggerFs } from '../log/real-logger-fs';
import { openExternalChecked } from '../external-opener';
import { realSettingsFs } from '../settings/real-settings-fs';
import { createSettingsStore, type SettingsStore } from '../settings/settings-store';
import { createHandlers } from './handlers';
import { registerIpc, sendEvent } from './register';

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
}): Promise<SettingsStore> {
  const { appOrigin, logger } = options;

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

  registerIpc({
    allowedOrigin: appOrigin,
    handlers: createHandlers({
      settings,
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
      logsFolder: logger.directory,
    }),
    // Only the failure kind and the channel name, never the input or the error text.
    onFailure: (failure, channel) => {
      logger.warn('ipc.rejected', { failure, channel });
    },
  });
  return settings;
}
