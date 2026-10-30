import { app, BrowserWindow, clipboard, ClipboardItem, nativeImage, shell } from 'electron';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { devDockIconPath, windowIconPath } from '../app-icon';
import type { Library } from '../library/library';
import { runProcess, type FfmpegPaths } from '../recording/ffmpeg';
import { previewPathFor } from '../review/review-handlers';
import { runPowerShell, type ShareFile } from './share';
import { createShareService, type ShareService } from './share-service';

/** Puts the file itself on the Windows clipboard, so it pastes into Explorer, chats and mail. */
const WINDOWS_COPY_SCRIPT = `
$ErrorActionPreference = 'Stop'
Set-Clipboard -LiteralPath $env:SCRIM_COPY_PATH
`;

function runAppleScript(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      [
        '-e',
        'on run argv',
        '-e',
        'set the clipboard to (POSIX file (item 1 of argv))',
        '-e',
        'end run',
        path,
      ],
      (error) => {
        if (error === null) resolve();
        else reject(new Error('copy failed'));
      },
    );
  });
}

/** Copy the file to the clipboard where the system has a way to do it, else null. */
function copyFileFor(platform: NodeJS.Platform): ((path: string) => Promise<void>) | null {
  if (platform === 'win32') {
    return (path) => runPowerShell(WINDOWS_COPY_SCRIPT, { SCRIM_COPY_PATH: path });
  }
  if (platform === 'darwin') return runAppleScript;
  return null;
}

export interface RealShareOptions {
  library: Library;
  share: ShareFile | null;
  /** The folder holding working copies for the review screen, inside the cache. */
  previewDir: () => string;
  isKnownFolder: (folder: string) => boolean;
  /** Folders a shared file may be in. */
  allowedRoots: () => readonly string[];
  ffmpeg: FfmpegPaths;
}

/** The share service on the real machine. */
export function createRealShareService(options: RealShareOptions): ShareService {
  const platform = process.platform;
  const tempDir = (): string => join(app.getPath('userData'), 'cache', 'shares');
  const dragIcon = (path: string) => {
    const image = nativeImage.createFromPath(path);
    if (!image.isEmpty()) return image.resize({ width: 128 });
    const icon = windowIconPath(platform, app.getAppPath()) ?? devDockIconPath(app.getAppPath());
    return nativeImage.createFromPath(icon).resize({ width: 64 });
  };

  return createShareService({
    platform,
    libraryFile: (id) => options.library.fileOf(id),
    reviewFile: async (folder) => {
      if (!options.isKnownFolder(folder)) return undefined;
      const file = previewPathFor(options.previewDir(), folder);
      const info = await stat(file).catch(() => undefined);
      if (info === undefined || info.size === 0) return 'not-ready';
      return { path: file, name: basename(file) };
    },
    allowedRoots: options.allowedRoots,
    tempDir,
    fileSize: async (path) => (await stat(path).catch(() => undefined))?.size,
    writeFile: (path, data) => writeFile(path, data),
    makeDir: async (path) => {
      await mkdir(path, { recursive: true });
    },
    listDir: async (path) => {
      const names = await readdir(path).catch(() => []);
      const entries = await Promise.all(
        names.map(async (name) => {
          const info = await stat(join(path, name)).catch(() => undefined);
          return info === undefined ? null : { name, modifiedMs: info.mtimeMs };
        }),
      );
      return entries.filter((entry) => entry !== null);
    },
    remove: (path) => rm(path, { force: true }),
    now: () => Date.now(),
    nativeShare: options.share,
    copyFile: copyFileFor(platform),
    copyImage: async (png) => {
      await clipboard.write([
        new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) }),
      ]);
    },
    readFile: (path) => readFile(path),
    copyText: async (text) => {
      await clipboard.writeText(text);
    },
    openMail: (subject) => shell.openExternal(`mailto:?subject=${encodeURIComponent(subject)}`),
    reveal: (path) => {
      shell.showItemInFolder(path);
    },
    startDrag: (path) => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      window?.webContents.startDrag({ file: path, icon: dragIcon(path) });
    },
    makeSmaller: async (path, outDir) => {
      const stem = basename(path, extname(path));
      const target = join(outDir, `${stem} (small).mp4`);
      const partial = `${target}.partial`;
      const result = await runProcess(
        options.ffmpeg.ffmpeg,
        [
          '-v',
          'error',
          '-y',
          '-i',
          path,
          '-vf',
          // 720p at most, never larger than the source, with an even width.
          "scale=-2:'min(720,ih)'",
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '30',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          '-f',
          'mp4',
          partial,
        ],
        { timeoutMs: 15 * 60_000 },
      );
      if (result.code !== 0) {
        await rm(partial, { force: true });
        throw new Error('smaller copy failed');
      }
      await rename(partial, target);
      return target;
    },
  });
}
