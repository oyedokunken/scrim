import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { realServiceFs, type ServiceFs } from '../../src/main/recording/fs-adapter';
import {
  takeScreenshot,
  type DisplayGeometry,
  type ImageLike,
  type ScreenshotDeps,
} from '../../src/main/recording/screenshot';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

class FakeImage implements ImageLike {
  crops: Box[] = [];
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly empty = false,
    private readonly marker = 'full',
  ) {}
  isEmpty(): boolean {
    return this.empty;
  }
  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
  crop(rect: Box): FakeImage {
    this.crops.push(rect);
    return new FakeImage(
      rect.width,
      rect.height,
      false,
      `crop ${String(rect.x)},${String(rect.y)}`,
    );
  }
  toPNG(): Uint8Array {
    return new TextEncoder().encode(
      `PNG ${String(this.width)}x${String(this.height)} ${this.marker}`,
    );
  }
}

function errorCode(result: { ok: boolean; error?: { code: string } }): string | undefined {
  return result.ok ? undefined : result.error?.code;
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scrim-shot-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const STAMP = 'Screenshot 2026-10-28 at 14.22.05';

function setup(overrides: Partial<ScreenshotDeps> = {}) {
  const copied: ImageLike[] = [];
  const display = new FakeImage(1920, 1080);
  const geometry: DisplayGeometry = { origin: { x: 0, y: 0 }, scaleFactor: 1.5 };
  const deps: ScreenshotDeps = {
    fs: realServiceFs,
    grabDisplay: () => Promise.resolve(display),
    grabWindow: () => Promise.resolve(new FakeImage(800, 600, false, 'window')),
    displayGeometry: () => geometry,
    copyImage: (image) => {
      copied.push(image);
      return Promise.resolve();
    },
    now: () => new Date(2026, 9, 28, 14, 22, 5),
    log: () => undefined,
    ...overrides,
  };
  return { deps, copied, display };
}

describe('takeScreenshot', () => {
  it('saves a PNG named for the time and copies it to the clipboard', async () => {
    const { deps, copied } = setup();
    const folder = join(dir, 'shots');
    const result = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder, copyToClipboard: true },
    );
    expect(result).toEqual({
      ok: true,
      value: { path: join(folder, `${STAMP}.png`), copied: true, width: 1920, height: 1080 },
    });
    expect(await readFile(join(folder, `${STAMP}.png`), 'utf8')).toBe('PNG 1920x1080 full');
    expect(copied).toHaveLength(1);
    expect(await readdir(folder)).toEqual([`${STAMP}.png`]);
  });

  it('never overwrites an earlier screenshot, and leaves no temporary file', async () => {
    const { deps } = setup();
    await takeScreenshot(deps, { kind: 'display' }, { folder: dir, copyToClipboard: false });
    const second = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder: dir, copyToClipboard: false },
    );
    expect(second.ok && second.value.path).toBe(join(dir, `${STAMP} 2.png`));
    expect((await readdir(dir)).sort()).toEqual([`${STAMP} 2.png`, `${STAMP}.png`]);
  });

  it('copies without saving when no folder is given', async () => {
    const { deps, copied } = setup();
    const result = await takeScreenshot(deps, { kind: 'display' }, { copyToClipboard: true });
    expect(result.ok && result.value.path).toBeUndefined();
    expect(result.ok && result.value.copied).toBe(true);
    expect(copied).toHaveLength(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses to do nothing', async () => {
    const { deps } = setup();
    const result = await takeScreenshot(deps, { kind: 'display' }, { copyToClipboard: false });
    expect(errorCode(result)).toBe('invalid-state');
  });

  it('cuts a region in the pixels of its display, relative to the display', async () => {
    const { deps, display } = setup({
      displayGeometry: () => ({ origin: { x: 1280, y: 0 }, scaleFactor: 1.5 }),
    });
    const result = await takeScreenshot(
      deps,
      { kind: 'region', displayId: '2', crop: { x: 1380, y: 40, width: 400, height: 200 } },
      { folder: dir, copyToClipboard: false },
    );
    expect(display.crops).toEqual([{ x: 150, y: 60, width: 600, height: 300 }]);
    expect(result.ok && [result.value.width, result.value.height]).toEqual([600, 300]);
  });

  it.each([1, 1.25, 1.5, 2])(
    'cuts exactly the box in physical pixels at %s scale, on a second display',
    async (scaleFactor) => {
      const { deps, display } = setup({
        displayGeometry: () => ({ origin: { x: 1920, y: 0 }, scaleFactor }),
      });
      const crop = { x: 2020, y: 100, width: 400, height: 300 };
      const result = await takeScreenshot(
        deps,
        { kind: 'region', displayId: '2', crop },
        { folder: dir, copyToClipboard: false },
      );
      expect(display.crops).toEqual([
        {
          x: Math.round(100 * scaleFactor),
          y: Math.round(100 * scaleFactor),
          width: Math.round(400 * scaleFactor),
          height: Math.round(300 * scaleFactor),
        },
      ]);
      expect(result.ok && result.value.width).toBe(Math.round(400 * scaleFactor));
    },
  );

  it('holds a region inside the picture when it runs a pixel past the edge', async () => {
    const { deps, display } = setup();
    await takeScreenshot(
      deps,
      { kind: 'region', crop: { x: 1270, y: 710, width: 100, height: 100 } },
      { folder: dir, copyToClipboard: false },
    );
    const [box] = display.crops;
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1920);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(1080);
  });

  it('takes a window by its source id', async () => {
    const asked: string[] = [];
    const { deps } = setup({
      grabWindow: (id) => {
        asked.push(id);
        return Promise.resolve(new FakeImage(800, 600, false, 'window'));
      },
    });
    const result = await takeScreenshot(
      deps,
      { kind: 'window', sourceId: 'window:42:0' },
      { folder: dir, copyToClipboard: true },
    );
    expect(asked).toEqual(['window:42:0']);
    expect(result.ok && result.value.width).toBe(800);
  });

  it.each([
    ['an empty picture', () => Promise.resolve(new FakeImage(0, 0, true))],
    ['no picture', () => Promise.resolve(undefined)],
    ['a capture that throws', () => Promise.reject(new Error('denied'))],
  ])('reports the screen as unavailable for %s', async (_label, grab) => {
    const { deps } = setup({ grabDisplay: grab, grabWindow: grab });
    for (const source of [
      { kind: 'display' as const },
      { kind: 'window' as const, sourceId: 'window:1:0' },
    ]) {
      const result = await takeScreenshot(deps, source, { folder: dir, copyToClipboard: true });
      expect(errorCode(result)).toBe('screen-unavailable');
    }
  });

  it('reports a region on a display that is gone', async () => {
    const { deps } = setup({ displayGeometry: () => undefined });
    const result = await takeScreenshot(
      deps,
      { kind: 'region', crop: { x: 0, y: 0, width: 100, height: 100 } },
      { folder: dir, copyToClipboard: false },
    );
    expect(errorCode(result)).toBe('screen-unavailable');
  });

  it.each([
    ['EACCES', 'folder-not-writable'],
    ['EPERM', 'folder-not-writable'],
    ['ENOSPC', 'disk-too-full'],
  ])('says so plainly when the folder fails with %s, and still copies', async (code, expected) => {
    const failing: ServiceFs = {
      ...realServiceFs,
      writeBytes: () => Promise.reject(Object.assign(new Error(code), { code })),
    };
    const { deps, copied } = setup({ fs: failing });
    const both = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder: dir, copyToClipboard: true },
    );
    expect(both.ok && both.value.path).toBeUndefined();
    expect(both.ok && both.value.copied).toBe(true);
    // Never silent: the failed save comes back with its plain message and next step.
    expect(both.ok && both.value.saveError?.code).toBe(expected);
    expect(both.ok && both.value.saveError?.nextStep).toBeTruthy();
    expect(copied).toHaveLength(1);

    const only = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder: dir, copyToClipboard: false },
    );
    expect(errorCode(only)).toBe(expected);
    expect(only.ok ? '' : only.error.message).not.toBe('');
    expect(await readdir(dir)).toEqual([]);
  });

  it.each(['EPERM', 'EACCES'])(
    'keeps the picture in the app folder when Windows blocks the chosen one (%s)',
    async (code) => {
      const blocked = join(dir, 'protected');
      const own = join(dir, 'own');
      const failing: ServiceFs = {
        ...realServiceFs,
        writeBytes: (path, bytes) =>
          path.startsWith(blocked)
            ? Promise.reject(Object.assign(new Error(code), { code }))
            : realServiceFs.writeBytes(path, bytes),
      };
      const { deps } = setup({ fs: failing, fallbackFolder: () => own });
      const result = await takeScreenshot(
        deps,
        { kind: 'display' },
        { folder: blocked, copyToClipboard: true },
      );
      expect(result.ok && result.value.path).toBe(join(own, `${STAMP}.png`));
      expect(await readdir(own)).toEqual([`${STAMP}.png`]);
      // Said plainly, with the code that explains it and what to do.
      expect(result.ok && result.value.saveError?.code).toBe('saved-elsewhere');
      expect(result.ok && result.value.saveError?.nextStep).toContain('Controlled folder access');
    },
  );

  it('does not use the app folder for a full disk, only for a refusal', async () => {
    const failing: ServiceFs = {
      ...realServiceFs,
      writeBytes: () => Promise.reject(Object.assign(new Error('full'), { code: 'ENOSPC' })),
    };
    const { deps } = setup({ fs: failing, fallbackFolder: () => join(dir, 'own') });
    const result = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder: join(dir, 'x'), copyToClipboard: false },
    );
    expect(errorCode(result)).toBe('disk-too-full');
  });

  it('keeps the file when only the copy fails', async () => {
    const { deps } = setup({
      copyImage: () => Promise.reject(new Error('clipboard busy')),
    });
    const result = await takeScreenshot(
      deps,
      { kind: 'display' },
      { folder: dir, copyToClipboard: true },
    );
    expect(result.ok && result.value.path).toBeDefined();
    expect(result.ok && result.value.copied).toBe(false);
  });

  it('fails when neither the save nor the copy worked', async () => {
    const { deps } = setup({
      copyImage: () => Promise.reject(new Error('clipboard busy')),
    });
    const result = await takeScreenshot(deps, { kind: 'display' }, { copyToClipboard: true });
    expect(result.ok).toBe(false);
  });
});
