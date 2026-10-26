import { describe, expect, it, vi } from 'vitest';
import {
  createWindowStateStore,
  resolveWindowBounds,
  type DisplayInfo,
  type SavedWindowState,
} from '../../src/main/shell/window-state';

const defaults = { width: 960, height: 640 };
const minimum = { width: 720, height: 520 };
const primary: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const second: DisplayInfo = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 1024 } };
const left: DisplayInfo = { id: 3, workArea: { x: -1600, y: 100, width: 1600, height: 900 } };

const saved = (overrides: Partial<SavedWindowState> = {}): SavedWindowState => ({
  x: 100,
  y: 80,
  width: 1000,
  height: 700,
  maximized: false,
  displayId: 1,
  ...overrides,
});

const fallback = { x: undefined, y: undefined, ...defaults, maximized: false };

describe('resolveWindowBounds', () => {
  it('restores a saved window on a display that still exists', () => {
    expect(resolveWindowBounds(saved(), [primary], defaults, minimum)).toEqual({
      x: 100,
      y: 80,
      width: 1000,
      height: 700,
      maximized: false,
    });
  });

  it('restores the maximized flag', () => {
    const result = resolveWindowBounds(saved({ maximized: true }), [primary], defaults, minimum);
    expect(result.maximized).toBe(true);
  });

  it('restores onto a second display, and onto one at negative coordinates', () => {
    expect(
      resolveWindowBounds(
        saved({ x: 2000, y: 50, displayId: 2 }),
        [primary, second],
        defaults,
        minimum,
      ),
    ).toMatchObject({ x: 2000, y: 50 });
    expect(
      resolveWindowBounds(
        saved({ x: -1500, y: 150, displayId: 3 }),
        [primary, left],
        defaults,
        minimum,
      ),
    ).toMatchObject({ x: -1500, y: 150 });
  });

  it('opens centered at the default size when that display is gone', () => {
    expect(resolveWindowBounds(saved({ displayId: 2 }), [primary], defaults, minimum)).toEqual(
      fallback,
    );
  });

  it('opens at the default when the saved window would be off screen', () => {
    expect(resolveWindowBounds(saved({ x: 5000 }), [primary], defaults, minimum)).toEqual(fallback);
    expect(resolveWindowBounds(saved({ y: -3000 }), [primary], defaults, minimum)).toEqual(
      fallback,
    );
  });

  it('pulls a window that hangs over an edge back onto the display', () => {
    const result = resolveWindowBounds(saved({ x: 1500, y: 700 }), [primary], defaults, minimum);
    expect(result.x).toBe(1920 - 1000);
    expect(result.y).toBe(1040 - 700);
  });

  it('never goes below the minimum size or above the display', () => {
    expect(
      resolveWindowBounds(saved({ width: 200, height: 100 }), [primary], defaults, minimum),
    ).toMatchObject({ width: 720, height: 520 });
    expect(
      resolveWindowBounds(saved({ width: 9000, height: 9000 }), [primary], defaults, minimum),
    ).toMatchObject({ width: 1920, height: 1040 });
  });

  it.each([
    ['nothing saved', undefined],
    ['null', null],
    ['a string', 'x'],
    ['a missing field', { x: 1, y: 1, width: 10, height: 10, maximized: false }],
    ['a float', saved({ x: 1.5 })],
    ['a zero width', saved({ width: 0 })],
    ['a wrong type', { ...saved(), maximized: 'yes' }],
  ])('uses the defaults for %s', (_name, value) => {
    expect(resolveWindowBounds(value, [primary], defaults, minimum)).toEqual(fallback);
  });
});

describe('window state store', () => {
  it('loads what it saved', async () => {
    let stored = '';
    const store = createWindowStateStore('state.json', {
      readText: () => Promise.resolve(stored || undefined),
      writeJsonAtomic: (_path, value) => {
        stored = JSON.stringify(value);
        return Promise.resolve();
      },
      writeJsonSync: () => undefined,
    });
    await store.save(saved());
    expect(await store.load()).toEqual(saved());
  });

  it('treats a missing file as nothing saved', async () => {
    const store = createWindowStateStore('state.json', {
      readText: () => Promise.resolve(undefined),
      writeJsonAtomic: () => Promise.resolve(),
      writeJsonSync: () => undefined,
    });
    expect(await store.load()).toBeUndefined();
  });

  it('treats a broken file as nothing saved, never as an error', async () => {
    const store = createWindowStateStore('state.json', {
      readText: () => Promise.resolve('{ not json'),
      writeJsonAtomic: () => Promise.resolve(),
      writeJsonSync: () => undefined,
    });
    expect(await store.load()).toBeUndefined();
  });

  it('survives a failed write', async () => {
    const write = vi.fn(() => Promise.reject(new Error('disk full')));
    const store = createWindowStateStore('state.json', {
      readText: () => Promise.resolve(undefined),
      writeJsonAtomic: write,
      writeJsonSync: () => undefined,
    });
    await expect(store.save(saved())).resolves.toBeUndefined();
    expect(write).toHaveBeenCalled();
  });

  it('refuses to write a state that does not parse', async () => {
    const write = vi.fn(() => Promise.resolve());
    const store = createWindowStateStore('state.json', {
      readText: () => Promise.resolve(undefined),
      writeJsonAtomic: write,
      writeJsonSync: () => undefined,
    });
    await store.save(saved({ width: -5 }));
    expect(write).not.toHaveBeenCalled();
  });
});

describe('window state store, synchronous save for the closing window', () => {
  const make = (writeJsonSync: (path: string, value: unknown) => void) =>
    createWindowStateStore('state.json', {
      readText: () => Promise.resolve(undefined),
      writeJsonAtomic: () => Promise.resolve(),
      writeJsonSync,
    });

  it('writes before it returns', () => {
    const write = vi.fn();
    make(write).saveSync(saved());
    expect(write).toHaveBeenCalledWith('state.json', saved());
  });

  it('survives a failed write', () => {
    const store = make(() => {
      throw new Error('disk full');
    });
    expect(() => {
      store.saveSync(saved());
    }).not.toThrow();
  });

  it('refuses a state that does not parse', () => {
    const write = vi.fn();
    make(write).saveSync(saved({ height: 0 }));
    expect(write).not.toHaveBeenCalled();
  });
});
