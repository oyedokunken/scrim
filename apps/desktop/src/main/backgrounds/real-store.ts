import { app, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createBackgroundStore, type BackgroundStore } from './store';

/** The folder for the person's own background pictures, inside Scrim's own data. */
function backgroundsFolder(): string {
  return join(app.getPath('userData'), 'backgrounds');
}

/** The store on the real disk, with the system file dialog for choosing a picture. */
export function createRealBackgroundStore(): BackgroundStore {
  return createBackgroundStore({
    dir: backgroundsFolder,
    newId: randomUUID,
    choose: async () => {
      const options = {
        title: 'Choose a background image',
        properties: ['openFile' as const],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      };
      const parent = BrowserWindow.getFocusedWindow();
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    fs: {
      mkdir: async (path) => {
        await mkdir(path, { recursive: true });
      },
      readdir: (path) => readdir(path),
      stat: async (path) => {
        const info = await stat(path);
        return { size: info.size, isFile: info.isFile() };
      },
      readFile: (path) => readFile(path),
      writeNew: (path, data) => writeFile(path, data, { flag: 'wx' }),
      writeReplace: async (path, data) => {
        const temporary = `${path}.tmp`;
        await writeFile(temporary, data);
        await rename(temporary, path);
      },
      remove: (path) => rm(path, { force: true }),
      existsSync,
    },
  });
}
