import { basename, dirname, extname, join, resolve } from 'node:path';
import { MAX_LISTED_SHOTS, PNG_DATA_URL_PREFIX, type ShotEntry } from '../../shared/image-contract';
import type { Handlers } from './dispatcher';
import { isInsideKnownFolder } from './handlers';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The file and clipboard work the image calls need, so tests can supply fakes. */
export interface ImageDeps {
  platform: NodeJS.Platform;
  /** Where screenshots live. Only PNG files inside it can be read, edited, dragged or deleted. */
  screenshotFolder: () => string;
  readFile: (path: string) => Promise<Buffer>;
  /** Creates a new file and fails if it exists, so an existing file is never overwritten. */
  writeNewFile: (path: string, data: Buffer) => Promise<void>;
  /** Writes a file the person chose in the save dialog, which has already asked about replacing it. */
  writeChosenFile: (path: string, data: Buffer) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  copyImage: (png: Buffer) => void;
  /** The system save dialog. Null when the person cancels. */
  chooseSavePath: (defaultName: string) => Promise<string | null>;
  startDrag: (path: string) => void;
  /** Opens the system share sheet for a file. Null when there is none. */
  share: ((path: string) => Promise<void>) | null;
  /** Moves the file to the recycle bin, so a delete can be undone from there. */
  trash: (path: string) => Promise<void>;
  /** The files directly inside a folder, with their size and time. Empty when it does not exist. */
  listFolder: (folder: string) => Promise<{ name: string; modifiedMs: number; bytes: number }[]>;
  /** The first bytes of a file, enough to read a PNG header. */
  readHead: (path: string, bytes: number) => Promise<Buffer>;
  /** A small PNG of the picture, as a data URL. Made in the main process so no big image crosses. */
  thumbnail: (path: string, width: number) => string;
}

class ImageError extends Error {}

/** The bytes of a PNG data URL. Anything else, or text that does not decode to a PNG, throws. */
export function decodePngDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new ImageError('not a png');
  const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new ImageError('not a png');
  }
  return bytes;
}

/** `shot.png` becomes `shot-edited.png`, then `shot-edited-2.png` when that name is taken. */
export async function editedPath(
  sourcePath: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  const folder = dirname(sourcePath);
  const extension = extname(sourcePath);
  const stem = basename(sourcePath, extension).replace(/-edited(-\d+)?$/, '');
  let candidate = join(folder, `${stem}-edited.png`);
  for (let counter = 2; await exists(candidate); counter += 1) {
    if (counter > 999) throw new ImageError('too many edits');
    candidate = join(folder, `${stem}-edited-${String(counter)}.png`);
  }
  return candidate;
}

/** Width and height from the header of a PNG, or null when the bytes are not one. */
export function pngSize(head: Buffer): { width: number; height: number } | null {
  if (head.length < 24 || !head.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

const THUMBNAIL_WIDTH = 320;

type ImageHandlers = Pick<
  Handlers,
  | 'image:read'
  | 'image:save-edited'
  | 'image:copy'
  | 'image:save-as'
  | 'image:drag'
  | 'image:delete'
  | 'image:list'
  | 'image:thumbnail'
  | 'image:share'
>;

export function createImageHandlers(deps: ImageDeps): ImageHandlers {
  /** A PNG inside the screenshots folder, resolved. Anything else is refused. */
  const screenshot = (path: string): string => {
    const inside = isInsideKnownFolder(path, [deps.screenshotFolder()], deps.platform);
    if (!inside || extname(path).toLowerCase() !== '.png') throw new ImageError('path not allowed');
    return resolve(path);
  };

  return {
    'image:read': async ({ path }) => {
      const bytes = await deps.readFile(screenshot(path));
      return `${PNG_DATA_URL_PREFIX}${bytes.toString('base64')}`;
    },
    'image:save-edited': async ({ sourcePath, dataUrl, copy }) => {
      const source = screenshot(sourcePath);
      const bytes = decodePngDataUrl(dataUrl);
      // A new name every time and an exclusive write: the original can never be touched.
      const target = await editedPath(source, deps.exists);
      await deps.writeNewFile(target, bytes);
      if (copy) deps.copyImage(bytes);
      return { path: target, copied: copy };
    },
    'image:copy': ({ dataUrl }) => {
      deps.copyImage(decodePngDataUrl(dataUrl));
    },
    'image:save-as': async ({ dataUrl, name }) => {
      const bytes = decodePngDataUrl(dataUrl);
      const safeName = basename(name).replace(/[<>:"/\\|?*\0]/g, '_');
      const chosen = await deps.chooseSavePath(
        safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName}.png`,
      );
      if (chosen === null) return { path: null };
      const target = extname(chosen).toLowerCase() === '.png' ? chosen : `${chosen}.png`;
      await deps.writeChosenFile(target, bytes);
      return { path: target };
    },
    'image:drag': ({ path }) => {
      deps.startDrag(screenshot(path));
    },
    'image:list': async () => {
      const folder = deps.screenshotFolder();
      const files = (await deps.listFolder(folder))
        .filter((file) => extname(file.name).toLowerCase() === '.png')
        .sort((a, b) => b.modifiedMs - a.modifiedMs)
        .slice(0, MAX_LISTED_SHOTS);
      const entries = await Promise.all(
        files.map(async (file): Promise<ShotEntry | null> => {
          const path = join(folder, file.name);
          try {
            const size = pngSize(await deps.readHead(path, 24));
            return size === null ? null : { path, ...file, ...size };
          } catch {
            return null;
          }
        }),
      );
      return entries.filter((entry): entry is ShotEntry => entry !== null);
    },
    'image:thumbnail': ({ path }) => deps.thumbnail(screenshot(path), THUMBNAIL_WIDTH),
    'image:share': async ({ path }) => {
      if (deps.share === null) throw new ImageError('sharing is not available');
      await deps.share(screenshot(path));
    },
    'image:delete': async ({ path }) => {
      await deps.trash(screenshot(path));
    },
  };
}
