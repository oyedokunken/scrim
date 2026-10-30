import { join } from 'node:path';
import { cropInPixels, type Box } from './crop';
import type { ServiceFs } from './fs-adapter';
import { errnoOf, errorFromFs, makeError } from './messages';
import type { Outcome, RecordingError } from './types';

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
  /** Set when the picture could not be saved but may still have been copied, so it is not silent. */
  saveError?: RecordingError | undefined;
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
  /** The app's own folder, used when the chosen one refuses the file. Never loses a capture. */
  fallbackFolder?: () => string;
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

  const save = async (target: string): Promise<string> => {
    await deps.fs.mkdir(target);
    const saved = await freeName(deps.fs, target, stampName(deps.now()));
    const temp = `${saved}.tmp`;
    await deps.fs.writeBytes(temp, png);
    await deps.fs.rename(temp, saved);
    return saved;
  };

  if (folder !== undefined) {
    try {
      path = await save(folder);
    } catch (error) {
      path = undefined;
      const code = errnoOf(error);
      // The copy may still work, so this is the only trace of why no file was saved.
      deps.log(`The screenshot could not be saved (${code ?? 'unknown'}).`);
      saveError = { ok: false, error: errorFromFs(error, 'start') };
      // Windows Controlled folder access blocks an app it does not know. Keep the capture in the
      // app's own folder and say so, instead of leaving only the clipboard copy.
      const blocked = code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
      const fallback = blocked ? deps.fallbackFolder?.() : undefined;
      if (fallback !== undefined && fallback !== folder) {
        try {
          path = await save(fallback);
          saveError = { ok: false, error: makeError('saved-elsewhere', code) };
        } catch {
          // The original error stays.
        }
      }
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
  return {
    ok: true,
    value: {
      path,
      copied,
      width,
      height,
      ...(saveError === undefined || saveError.ok ? {} : { saveError: saveError.error }),
    },
  };
}
