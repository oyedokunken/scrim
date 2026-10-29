import { app, nativeImage, shell } from 'electron';
import { mkdir, open, readdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pngSize } from '../ipc/image-handlers';
import { probeFile, resolveFfmpegPaths, runProcess } from '../recording/ffmpeg';
import { projectsRoot } from '../recording/projects-folder';
import { createLibrary, type DirEntry, type Library } from './library';

const THUMB_WIDTH = 320;

async function readDir(folder: string): Promise<DirEntry[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    names.map(async (name): Promise<DirEntry | null> => {
      try {
        const info = await stat(join(folder, name));
        return {
          name,
          isDirectory: info.isDirectory(),
          modifiedMs: info.mtimeMs,
          bytes: info.size,
        };
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((entry) => entry !== null);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The library on the real machine. Thumbnails of videos are cut once by FFmpeg and kept in the user data folder. */
export function createRealLibrary(options: {
  videosFolder: () => string;
  screenshotsFolder: () => string;
  share: ((path: string) => Promise<void>) | null;
}): Library {
  const paths = resolveFfmpegPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    env: process.env,
  });
  const thumbs = (): string => join(app.getPath('userData'), 'thumbs');

  return createLibrary({
    projectsRoot: () =>
      projectsRoot({
        platform: process.platform,
        env: process.env,
        userData: app.getPath('userData'),
      }),
    videosFolder: options.videosFolder,
    screenshotsFolder: options.screenshotsFolder,
    readDir,
    readText: async (path) => {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return undefined;
      }
    },
    exists,
    videoDurationMs: async (path) => {
      const probe = await probeFile(runProcess, paths, path);
      return probe?.durationSec === undefined ? null : Math.round(probe.durationSec * 1000);
    },
    videoFrame: async (video, key) => {
      const out = join(thumbs(), `${key}.png`);
      if (!(await exists(out))) {
        await mkdir(thumbs(), { recursive: true });
        const result = await runProcess(
          paths.ffmpeg,
          [
            '-v',
            'error',
            '-ss',
            '0.5',
            '-i',
            video,
            '-frames:v',
            '1',
            '-vf',
            `scale=${String(THUMB_WIDTH)}:-2`,
            '-y',
            out,
          ],
          { timeoutMs: 20_000 },
        );
        if (result.code !== 0 || !(await exists(out))) {
          // A video shorter than the seek has no frame at 0.5 s, so try the very first one.
          const retry = await runProcess(
            paths.ffmpeg,
            [
              '-v',
              'error',
              '-i',
              video,
              '-frames:v',
              '1',
              '-vf',
              `scale=${String(THUMB_WIDTH)}:-2`,
              '-y',
              out,
            ],
            { timeoutMs: 20_000 },
          );
          if (retry.code !== 0) return null;
        }
      }
      const image = nativeImage.createFromPath(out);
      return image.isEmpty() ? null : image.toDataURL();
    },
    imageThumbnail: (path) =>
      nativeImage.createFromPath(path).resize({ width: THUMB_WIDTH, quality: 'good' }).toDataURL(),
    readImage: async (path) => `data:image/png;base64,${(await readFile(path)).toString('base64')}`,
    trash: (path) => shell.trashItem(path),
    rename,
    openPath: (path) => shell.openPath(path),
    showItem: (path) => {
      shell.showItemInFolder(path);
    },
    share: options.share ?? (() => Promise.reject(new Error('sharing is not available'))),
    imageSize: async (path) => {
      try {
        const handle = await open(path, 'r');
        try {
          const buffer = Buffer.alloc(24);
          const { bytesRead } = await handle.read(buffer, 0, 24, 0);
          return pngSize(buffer.subarray(0, bytesRead));
        } finally {
          await handle.close();
        }
      } catch {
        return null;
      }
    },
  });
}
