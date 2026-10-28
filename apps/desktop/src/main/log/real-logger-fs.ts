import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import type { LoggerFs } from './logger';

/** The real file system for the logger. */
export const realLoggerFs: LoggerFs = {
  async mkdir(dir) {
    await mkdir(dir, { recursive: true });
  },
  append: (path, text) => appendFile(path, text, 'utf8'),
  async size(path) {
    try {
      return (await stat(path)).size;
    } catch {
      return undefined;
    }
  },
  rename,
  async remove(path) {
    await rm(path, { force: true });
  },
};
