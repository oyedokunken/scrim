import { readFile, rename } from 'node:fs/promises';
import { writeJsonAtomic } from '../recording/fs-adapter';
import type { SettingsFs } from './settings-store';

/** The real file system for the settings store. The atomic writer retries a busy rename. */
export const realSettingsFs: SettingsFs = {
  async readText(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return undefined;
      }
      throw error;
    }
  },
  writeJsonAtomic: (path, value) => writeJsonAtomic(path, value),
  rename,
};
