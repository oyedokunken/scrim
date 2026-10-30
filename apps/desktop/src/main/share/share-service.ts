import { randomUUID } from 'node:crypto';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { isInsideRoot } from '../app-protocol';
import { LARGE_VIDEO_BYTES, type ShareAction, type ShareSource } from '../../shared/share-contract';

/** A file that can be shared, found from a source the page named. */
interface Target {
  path: string;
  name: string;
  media: 'video' | 'image';
  bytes: number;
}

type Found = { ok: true; target: Target } | { ok: false; reason: 'missing' | 'not-ready' };

export type ShareInfo =
  | {
      ok: true;
      name: string;
      media: 'video' | 'image';
      bytes: number;
      large: boolean;
      can: {
        app: boolean;
        copyFile: boolean;
        copyImage: boolean;
        email: boolean;
        reveal: boolean;
        drag: boolean;
        smaller: boolean;
      };
    }
  | { ok: false; reason: 'missing' | 'not-ready'; message: string };

export type ShareResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'missing' | 'not-ready' | 'unsupported' | 'failed'; message: string };

/** Everything the service needs from the machine, so tests run it on a made up one. */
export interface ShareServiceDeps {
  platform: NodeJS.Platform;
  /** The file of a library item from the last listing, or undefined for an id that is not in it. */
  libraryFile: (id: string) => { path: string; media: 'video' | 'image'; name: string } | undefined;
  /** The finished working copy of a recording under review, or undefined when it is not made yet. */
  reviewFile: (folder: string) => Promise<{ path: string; name: string } | 'not-ready' | undefined>;
  /** Folders a shared file may be in: projects, cache, the chosen output folders, the fallback folders. */
  allowedRoots: () => readonly string[];
  /** The folder for temporary copies, inside the cache. */
  tempDir: () => string;
  /** File size, or undefined when the file does not exist. */
  fileSize: (path: string) => Promise<number | undefined>;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  makeDir: (path: string) => Promise<void>;
  listDir: (path: string) => Promise<{ name: string; modifiedMs: number }[]>;
  remove: (path: string) => Promise<void>;
  now: () => number;
  /** The system share sheet, or null where there is none. */
  nativeShare: ((path: string) => Promise<void>) | null;
  /** Puts the file itself on the clipboard, or null where that cannot be done. */
  copyFile: ((path: string) => Promise<void>) | null;
  copyImage: (png: Buffer) => void | Promise<void>;
  readFile: (path: string) => Promise<Buffer>;
  copyText: (text: string) => void | Promise<void>;
  openMail: (subject: string) => Promise<void>;
  reveal: (path: string) => void;
  startDrag: (path: string) => void;
  /** Cuts a 720p copy of a video into the temporary folder and returns its path. */
  makeSmaller: (path: string, outDir: string) => Promise<string>;
}

/** Temporary copies older than this are removed the next time something is shared. */
const TEMP_MAX_AGE_MS = 60 * 60 * 1000;

const MISSING_TEXT = 'Scrim could not find that file. It may have been moved or deleted.';

function safeName(name: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*]/g, ' ')
    // Control characters (code 0 to 31) are dropped as well.
    .split('')
    .filter((character) => character.charCodeAt(0) > 31)
    .join('')
    .replace(/\.{2,}/g, '.')
    .trim();
  return clean === '' ? 'Scrim screenshot' : clean.slice(0, 120);
}

function pngFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/**
 * One place that shares a recording or a screenshot, for the editor, the review screen, the
 * Library cards and the detail page. Every file it touches is checked against the allowed
 * folders first, whatever the source, so a path that is not in the library can never leave.
 */
export function createShareService(deps: ShareServiceDeps) {
  const caseInsensitive = deps.platform === 'win32' || deps.platform === 'darwin';

  /** True for an absolute path with no NUL that is inside an allowed folder after dot segments are folded. */
  function isAllowed(path: string): boolean {
    if (path.includes('\0') || !isAbsolute(path)) return false;
    const target = resolve(path);
    return deps.allowedRoots().some((root) => isInsideRoot(resolve(root), target, caseInsensitive));
  }

  async function pruneTemp(): Promise<void> {
    const dir = deps.tempDir();
    const entries = await deps.listDir(dir).catch(() => []);
    const cutoff = deps.now() - TEMP_MAX_AGE_MS;
    for (const entry of entries) {
      if (entry.modifiedMs < cutoff)
        await deps.remove(join(dir, entry.name)).catch(() => undefined);
    }
  }

  async function find(source: ShareSource): Promise<Found> {
    if (source.kind === 'edited') {
      // The final picture with its marks is written once to a temporary PNG in the app cache.
      await pruneTemp();
      const data = pngFromDataUrl(source.dataUrl);
      const dir = deps.tempDir();
      await deps.makeDir(dir);
      const path = join(dir, `${randomUUID()}-${safeName(source.name)}.png`);
      if (!isAllowed(path)) return { ok: false, reason: 'missing' };
      await deps.writeFile(path, data);
      return {
        ok: true,
        target: { path, name: `${safeName(source.name)}.png`, media: 'image', bytes: data.length },
      };
    }
    let path: string;
    let name: string;
    let media: 'video' | 'image';
    if (source.kind === 'library') {
      const file = deps.libraryFile(source.id);
      if (file === undefined) return { ok: false, reason: 'missing' };
      ({ path, name, media } = file);
    } else {
      const file = await deps.reviewFile(source.folder);
      if (file === 'not-ready') return { ok: false, reason: 'not-ready' };
      if (file === undefined) return { ok: false, reason: 'missing' };
      ({ path, name } = file);
      media = 'video';
    }
    if (!isAllowed(path)) return { ok: false, reason: 'missing' };
    const bytes = await deps.fileSize(path);
    if (bytes === undefined) return { ok: false, reason: 'missing' };
    return {
      ok: true,
      target: { path, name: basename(name, extname(name)) + extname(path), media, bytes },
    };
  }

  function notFound(found: { reason: 'missing' | 'not-ready' }): ShareResult & { ok: false } {
    return found.reason === 'not-ready'
      ? {
          ok: false,
          reason: 'not-ready',
          message: 'The finished video is not ready yet. Wait for it, or press Export.',
        }
      : { ok: false, reason: 'missing', message: MISSING_TEXT };
  }

  const fail = (message: string): ShareResult => ({ ok: false, reason: 'failed', message });

  return {
    isAllowed,

    async info(source: ShareSource): Promise<ShareInfo> {
      const found = await find(source);
      if (!found.ok) {
        const text = notFound(found);
        return { ok: false, reason: found.reason, message: text.message };
      }
      const { target } = found;
      const video = target.media === 'video';
      return {
        ok: true,
        name: target.name,
        media: target.media,
        bytes: target.bytes,
        large: video && target.bytes > LARGE_VIDEO_BYTES,
        can: {
          app: deps.nativeShare !== null,
          copyFile: deps.copyFile !== null,
          copyImage: !video,
          email: true,
          reveal: source.kind !== 'edited',
          drag: true,
          smaller: video,
        },
      };
    },

    async run(source: ShareSource, action: ShareAction): Promise<ShareResult> {
      if (action === 'copy-image' && source.kind === 'edited') {
        // The picture is already in hand, so no file is needed.
        try {
          await deps.copyImage(pngFromDataUrl(source.dataUrl));
          return { ok: true, message: 'Image copied. Paste it where you want it.' };
        } catch {
          return fail('Scrim could not copy the image. Try again.');
        }
      }
      const found = await find(source);
      if (!found.ok) return notFound(found);
      const { target } = found;
      try {
        switch (action) {
          case 'app': {
            if (deps.nativeShare === null) {
              return {
                ok: false,
                reason: 'unsupported',
                message: 'This computer has no share sheet Scrim can open. Use Copy file instead.',
              };
            }
            await deps.nativeShare(target.path);
            return { ok: true, message: 'Share sheet opened.' };
          }
          case 'copy-file': {
            if (deps.copyFile === null) {
              return {
                ok: false,
                reason: 'unsupported',
                message: 'Copying a file is not available on this computer. Use Show in folder.',
              };
            }
            await deps.copyFile(target.path);
            return {
              ok: true,
              message: 'File copied. Paste it into a message, a chat or a folder.',
            };
          }
          case 'copy-image': {
            if (target.media !== 'image') {
              return {
                ok: false,
                reason: 'unsupported',
                message: 'Only a screenshot can be copied as an image.',
              };
            }
            await deps.copyImage(await deps.readFile(target.path));
            return { ok: true, message: 'Image copied. Paste it where you want it.' };
          }
          case 'email': {
            // A mail link cannot carry an attachment, so the file goes on the clipboard for pasting.
            let copied = false;
            if (deps.copyFile !== null) {
              await deps.copyFile(target.path);
              copied = true;
            }
            await deps.openMail(
              `${target.media === 'video' ? 'Recording' : 'Screenshot'}: ${target.name}`,
            );
            if (!copied && source.kind !== 'edited') deps.reveal(target.path);
            return {
              ok: true,
              message: copied
                ? 'File copied. Paste it into your email.'
                : 'Your mail app opened. Attach the file from the folder that just opened.',
            };
          }
          case 'reveal': {
            if (source.kind === 'edited')
              return fail('Save the screenshot first, then show it in its folder.');
            deps.reveal(target.path);
            return { ok: true, message: 'Showing the file in its folder.' };
          }
          case 'copy-path': {
            await deps.copyText(target.path);
            return { ok: true, message: 'File path copied.' };
          }
          case 'smaller': {
            if (target.media !== 'video') {
              return {
                ok: false,
                reason: 'unsupported',
                message: 'Only a video can be made smaller.',
              };
            }
            await pruneTemp();
            const dir = deps.tempDir();
            await deps.makeDir(dir);
            const small = await deps.makeSmaller(target.path, dir);
            if (!isAllowed(small)) return fail('Scrim could not make a smaller copy.');
            if (deps.nativeShare !== null) {
              await deps.nativeShare(small);
              return {
                ok: true,
                message: 'Smaller copy made. Share sheet opened. Your original is unchanged.',
              };
            }
            if (deps.copyFile !== null) {
              await deps.copyFile(small);
              return {
                ok: true,
                message:
                  'Smaller copy made and copied. Paste it where you want it. Your original is unchanged.',
              };
            }
            deps.reveal(small);
            return {
              ok: true,
              message: 'Smaller copy made. It is in the folder that just opened.',
            };
          }
        }
      } catch {
        return fail('Scrim could not do that. Try again.');
      }
    },

    /** Starts a drag of the file. Nothing happens for a file that is missing or not allowed. */
    async drag(source: ShareSource): Promise<void> {
      const found = await find(source);
      if (found.ok) deps.startDrag(found.target.path);
    },
  };
}

export type ShareService = ReturnType<typeof createShareService>;
