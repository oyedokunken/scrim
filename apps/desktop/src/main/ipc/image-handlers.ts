import { basename, dirname, extname, join, resolve } from 'node:path';
import { PNG_DATA_URL_PREFIX } from '../../shared/image-contract';
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
  /** Moves the file to the recycle bin, so a delete can be undone from there. */
  trash: (path: string) => Promise<void>;
}

export class ImageError extends Error {}

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

type ImageHandlers = Pick<
  Handlers,
  | 'image:read'
  | 'image:save-edited'
  | 'image:copy'
  | 'image:save-as'
  | 'image:drag'
  | 'image:delete'
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
    'image:delete': async ({ path }) => {
      await deps.trash(screenshot(path));
    },
  };
}
