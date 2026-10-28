import { join } from 'node:path';
import { cropInPixels, type Box } from './crop';
import type { ServiceFs } from './fs-adapter';
import { errorFromFs, makeError } from './messages';
import type { Outcome } from './types';

/** What to photograph. The same shapes the recording uses, so the home screen reuses its choice. */
export type ScreenshotSource =
  | { kind: 'display'; displayId?: string | undefined }
  | { kind: 'region'; displayId?: string | undefined; crop: Box }
  | { kind: 'window'; sourceId: string };

export interface ScreenshotOptions {
  /** Where to save the PNG. Leave out to copy without saving. */
  folder?: string | undefined;
  copyToClipboard: boolean;
}

export interface ScreenshotResult {
  /** The saved file, when one was saved. */
  path?: string | undefined;
  copied: boolean;
  width: number;
  height: number;
}

/** The slice of an image this code uses. The real one is Electron's `NativeImage`. */
export interface ImageLike {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  crop(rect: Box): ImageLike;
  toPNG(): Uint8Array;
}

export interface DisplayGeometry {
  /** Where the display sits on the desktop, in device independent pixels. */
  origin: { x: number; y: number };
  scaleFactor: number;
}

export interface ScreenshotDeps {
  fs: ServiceFs;
  /** A picture of a whole display at its real pixel size, or undefined when it cannot be taken. */
  grabDisplay(displayId: string | undefined): Promise<ImageLike | undefined>;
  /** A picture of one window by its capture source id. */
  grabWindow(sourceId: string): Promise<ImageLike | undefined>;
  /** Where a display is and how it is scaled, to place a region. */
  displayGeometry(displayId: string | undefined): DisplayGeometry | undefined;
  copyImage(image: ImageLike): Promise<void>;
  now(): Date;
  log(message: string): void;
}

/** `Screenshot 2026-10-28 at 14.22.05`, the same on every system. */
function stampName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `Screenshot ${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} at ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

async function freeName(fs: ServiceFs, folder: string, base: string): Promise<string> {
  let candidate = join(folder, `${base}.png`);
  for (let n = 2; await fs.exists(candidate); n += 1) {
    candidate = join(folder, `${base} ${String(n)}.png`);
  }
  return candidate;
}

/**
 * Takes one screenshot as a PNG, saves it to the chosen folder and copies it to the clipboard, as
 * asked. A region is cut from a picture of its display, in physical pixels. A file is written under
 * a temporary name and renamed, and never replaces another file. Every failure is a value with a
 * plain message, and a failed save does not stop the copy.
 */
export async function takeScreenshot(
  deps: ScreenshotDeps,
  source: ScreenshotSource,
  options: ScreenshotOptions,
): Promise<Outcome<ScreenshotResult>> {
  const folder = options.folder;
  if (folder === undefined && !options.copyToClipboard) {
    return { ok: false, error: makeError('invalid-state', 'nothing to do') };
  }

  let image: ImageLike | undefined;
  try {
    image =
      source.kind === 'window'
        ? await deps.grabWindow(source.sourceId)
        : await deps.grabDisplay(source.displayId);
  } catch (error) {
    deps.log(`The screenshot could not be taken: ${String(error)}`);
    return { ok: false, error: makeError('screen-unavailable') };
  }
  if (image === undefined || image.isEmpty()) {
    return { ok: false, error: makeError('screen-unavailable') };
  }

  if (source.kind === 'region') {
    const geometry = deps.displayGeometry(source.displayId);
    if (geometry === undefined) return { ok: false, error: makeError('screen-unavailable') };
    const box = cropInPixels(source.crop, geometry.origin, geometry.scaleFactor);
    const size = image.getSize();
    // The picture can be a pixel off the display's size, so the box is held inside it.
    const x = Math.min(Math.max(0, box.x), size.width - 1);
    const y = Math.min(Math.max(0, box.y), size.height - 1);
    image = image.crop({
      x,
      y,
      width: Math.max(1, Math.min(box.width, size.width - x)),
      height: Math.max(1, Math.min(box.height, size.height - y)),
    });
    if (image.isEmpty()) return { ok: false, error: makeError('screen-unavailable') };
  }

  const { width, height } = image.getSize();
  const png = image.toPNG();
  let path: string | undefined;
  let saveError: Outcome<never> | undefined;

  if (folder !== undefined) {
    try {
      await deps.fs.mkdir(folder);
      path = await freeName(deps.fs, folder, stampName(deps.now()));
      const temp = `${path}.tmp`;
      await deps.fs.writeBytes(temp, png);
      await deps.fs.rename(temp, path);
    } catch (error) {
      path = undefined;
      saveError = { ok: false, error: errorFromFs(error, 'start') };
    }
  }

  let copied = false;
  if (options.copyToClipboard) {
    try {
      await deps.copyImage(image);
      copied = true;
    } catch (error) {
      deps.log(`The screenshot could not be copied: ${String(error)}`);
    }
  }

  // Nothing came of it: no file and no copy. Say why the save failed, or that the copy did.
  if (path === undefined && !copied) {
    return saveError ?? { ok: false, error: makeError('unknown', 'clipboard') };
  }
  return { ok: true, value: { path, copied, width, height } };
}
