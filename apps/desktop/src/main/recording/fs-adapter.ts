import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import type { FileSink } from './chunk-writer';

/** A file opened for append, as a sink. The raw file is only ever appended to. */
export async function openAppendSink(path: string): Promise<FileSink> {
  const handle = await open(path, 'a');
  return {
    async append(data) {
      // `appendFile` on a handle opened with `a` always writes at the end.
      await handle.appendFile(data);
    },
    async sync() {
      await handle.sync();
    },
    async close() {
      await handle.close();
    },
  };
}

/** The few file system calls the atomic writer needs, so tests can make them fail. */
export interface AtomicFs {
  writeSynced(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export const realAtomicFs: AtomicFs = {
  async writeSynced(path, text) {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename,
  async remove(path) {
    await rm(path, { force: true });
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 6;

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

/**
 * Writes JSON so a reader sees the old file or the new one, never half of either: write a temp
 * file next to it, sync it, then rename over the target. On Windows the rename can fail for a
 * moment with `EPERM` or `EBUSY` while an antivirus scan or an indexer holds the file, so it is
 * retried a few times with a growing pause before the error is allowed through.
 */
export async function writeJsonAtomic(
  path: string,
  value: unknown,
  fs: AtomicFs = realAtomicFs,
): Promise<void> {
  const temp = `${path}.tmp`;
  await fs.writeSynced(temp, `${JSON.stringify(value, null, 2)}\n`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rename(temp, path);
      return;
    } catch (error) {
      const code = codeOf(error);
      if (code === undefined || !RETRYABLE.has(code) || attempt >= RENAME_ATTEMPTS) {
        await fs.remove(temp).catch(() => undefined);
        throw error;
      }
      await fs.sleep(25 * attempt);
    }
  }
}

/** Free bytes on the volume that holds `path`, for an unprivileged user. */
export async function freeBytes(path: string): Promise<number> {
  const stats = await statfs(path);
  return stats.bavail * stats.bsize;
}

/** The file system calls the recording service makes, in one place, so tests can fail any of them. */
export interface ServiceFs {
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  openAppend(path: string): Promise<FileSink>;
  writeJsonAtomic(path: string, value: unknown): Promise<void>;
  readText(path: string): Promise<string>;
  /** Writes a new file and fails if one is already there, so nothing is ever overwritten. */
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** The size of a file in bytes, or undefined when it does not exist. */
  fileSize(path: string): Promise<number | undefined>;
  freeBytes(path: string): Promise<number>;
}

export const realServiceFs: ServiceFs = {
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  openAppend: openAppendSink,
  writeJsonAtomic: (path, value) => writeJsonAtomic(path, value),
  readText: (path) => readFile(path, 'utf8'),
  writeBytes: (path, data) => writeFile(path, data, { flag: 'wx' }),
  async remove(path) {
    await rm(path, { force: true });
  },
  rename,
  async fileSize(path) {
    try {
      return (await stat(path)).size;
    } catch {
      return undefined;
    }
  },
  freeBytes,
};
