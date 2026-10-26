import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { realAtomicFs, writeJsonAtomic, type AtomicFs } from '../../src/main/recording/fs-adapter';
import { realSettingsFs } from '../../src/main/settings/real-settings-fs';
import { createSettingsStore, type SettingsFs } from '../../src/main/settings/settings-store';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scrim-settings-'));
  file = join(dir, 'settings.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const make = (fs: SettingsFs = realSettingsFs, extra: { onChange?: (s: Settings) => void } = {}) =>
  createSettingsStore({ path: file, fs, now: () => 1234, ...extra });
const onDisk = (): unknown => JSON.parse(readFileSync(file, 'utf8'));
const names = (): string[] => readdirSync(dir).sort();

describe('loading', () => {
  it('uses the defaults when there is no file, and writes nothing yet', async () => {
    expect(await make().load()).toEqual(DEFAULT_SETTINGS);
    expect(names()).toEqual([]);
  });

  it('reads a valid file', async () => {
    writeFileSync(
      file,
      JSON.stringify({ version: 1, ...DEFAULT_SETTINGS, zoomLevel: 2.4, micOn: true }),
    );
    const settings = await make().load();
    expect(settings.zoomLevel).toBe(2.4);
    expect(settings.micOn).toBe(true);
  });

  it('fills a missing setting with its default, so an older file keeps working', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, zoomLevel: 2.4 }));
    expect(await make().load()).toEqual({ ...DEFAULT_SETTINGS, zoomLevel: 2.4 });
    expect(names()).toEqual(['settings.json']);
  });

  it('ignores a setting it does not know, as from a newer version', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, futureSetting: 'x', cameraOn: true }));
    const settings = await make().load();
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, cameraOn: true });
    expect(settings).not.toHaveProperty('futureSetting');
  });
});

describe('a file that is not valid', () => {
  const cases: [string, string][] = [
    ['broken json', '{ "version": 1, "zoomLevel": '],
    ['an empty file', ''],
    ['not an object', '[1, 2, 3]'],
    ['a wrong type', JSON.stringify({ version: 1, zoomLevel: 'big' })],
    ['a value out of range', JSON.stringify({ version: 1, zoomLevel: 99 })],
    ['a setting that is null by mistake', JSON.stringify({ version: 1, zoomOn: null })],
    ['an unknown version', JSON.stringify({ version: 2, zoomLevel: 2 })],
    ['no version', JSON.stringify({ zoomLevel: 2 })],
  ];

  it.each(cases)(
    '%s is moved aside, never deleted, and replaced with the defaults',
    async (_name, text) => {
      writeFileSync(file, text);
      const log = vi.fn();
      const store = createSettingsStore({ path: file, fs: realSettingsFs, now: () => 1234, log });

      expect(await store.load()).toEqual(DEFAULT_SETTINGS);
      expect(readFileSync(`${file}.invalid-1234`, 'utf8')).toBe(text);
      expect(onDisk()).toEqual({ version: 1, ...DEFAULT_SETTINGS });
      expect(log).toHaveBeenCalledWith('settings.invalid-file', expect.any(Object));
    },
  );

  it('never puts the file contents in the log', async () => {
    writeFileSync(file, '{"destinationFolder":"C:\\\\Users\\\\zainab\\\\Videos", broken');
    const log = vi.fn();
    await createSettingsStore({ path: file, fs: realSettingsFs, log }).load();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/zainab|Videos/);
  });

  it('still starts with the defaults when the file cannot be moved or rewritten', async () => {
    writeFileSync(file, 'not json');
    const fs: SettingsFs = {
      readText: () => Promise.resolve('not json'),
      writeJsonAtomic: () => Promise.reject(new Error('read only disk')),
      rename: () => Promise.reject(new Error('locked')),
    };
    expect(await make(fs).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('still starts when the file cannot be read at all', async () => {
    const fs: SettingsFs = {
      readText: () => Promise.reject(new Error('EIO')),
      writeJsonAtomic: () => Promise.resolve(),
      rename: () => Promise.resolve(),
    };
    expect(await make(fs).load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('changing settings', () => {
  it('merges a patch, writes it, and returns the whole settings', async () => {
    const changed = vi.fn();
    const store = make(realSettingsFs, { onChange: changed });
    await store.load();
    const result = await store.set({ zoomLevel: 2.5, cameraOn: true });
    expect(result).toEqual({ ...DEFAULT_SETTINGS, zoomLevel: 2.5, cameraOn: true });
    expect(store.get()).toEqual(result);
    expect(onDisk()).toEqual({ version: 1, ...result });
    expect(changed).toHaveBeenCalledWith(result);
  });

  it('a later load sees what was saved', async () => {
    const first = make();
    await first.load();
    await first.set({ destinationFolder: 'C:\\Recordings' });
    expect((await make().load()).destinationFolder).toBe('C:\\Recordings');
  });

  it('ignores a setting that was sent as undefined, instead of erasing it', async () => {
    const store = make();
    await store.load();
    await store.set({ zoomLevel: 2.5 });
    await store.set({ zoomLevel: undefined, micOn: true });
    expect(store.get().zoomLevel).toBe(2.5);
    expect(store.get().micOn).toBe(true);
  });

  it('can set a nullable setting back to null', async () => {
    const store = make();
    await store.load();
    await store.set({ destinationFolder: 'C:\\Recordings' });
    await store.set({ destinationFolder: null });
    expect(store.get().destinationFolder).toBeNull();
  });

  it.each([{ zoomLevel: 99 }, { unknown: 1 }, { frameRate: 45 }, { destinationFolder: '' }])(
    'rejects the patch %j and writes nothing',
    async (patch) => {
      const write = vi.fn(() => Promise.resolve());
      const store = make({
        readText: () => Promise.resolve(undefined),
        writeJsonAtomic: write,
        rename: () => Promise.resolve(),
      });
      await store.load();
      await expect(store.set(patch as never)).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();
      expect(store.get()).toEqual(DEFAULT_SETTINGS);
    },
  );

  it('keeps every write when several arrive at once, in order', async () => {
    const store = make();
    await store.load();
    await Promise.all([
      store.set({ zoomLevel: 1.5 }),
      store.set({ zoomLevel: 2 }),
      store.set({ micOn: true }),
      store.set({ zoomLevel: 2.8 }),
    ]);
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, zoomLevel: 2.8, micOn: true });
    expect(onDisk()).toEqual({ version: 1, ...store.get() });
  });

  it('does not report a setting as saved when the write fails, and the next write still works', async () => {
    let fail = true;
    const fs: SettingsFs = {
      readText: () => Promise.resolve(undefined),
      writeJsonAtomic: (path, value) =>
        fail ? Promise.reject(new Error('disk full')) : realSettingsFs.writeJsonAtomic(path, value),
      rename: () => Promise.resolve(),
    };
    const changed = vi.fn();
    const store = make(fs, { onChange: changed });
    await store.load();
    await expect(store.set({ zoomLevel: 2.5 })).rejects.toThrow('disk full');
    expect(store.get().zoomLevel).toBe(DEFAULT_SETTINGS.zoomLevel);
    expect(changed).not.toHaveBeenCalled();
    fail = false;
    await store.set({ zoomLevel: 2.2 });
    expect(store.get().zoomLevel).toBe(2.2);
  });
});

describe('an interrupted write', () => {
  it('leaves the last whole file, because the temp file is never read', async () => {
    const first = make();
    await first.load();
    await first.set({ zoomLevel: 2.6 });
    // A crash after the temp file is written, or while it is half written, leaves it behind.
    writeFileSync(`${file}.tmp`, '{ "version": 1, "zoomLev');
    expect((await make().load()).zoomLevel).toBe(2.6);

    writeFileSync(
      `${file}.tmp`,
      JSON.stringify({ version: 1, ...DEFAULT_SETTINGS, zoomLevel: 1.3 }),
    );
    expect((await make().load()).zoomLevel).toBe(2.6);
  });

  it('leaves the old file when the rename never succeeds, and removes the temp file', async () => {
    const first = make();
    await first.load();
    await first.set({ zoomLevel: 2.6 });

    const busy: AtomicFs = {
      ...realAtomicFs,
      rename: () => Promise.reject(Object.assign(new Error('busy'), { code: 'EBUSY' })),
      sleep: () => Promise.resolve(),
    };
    const store = make({
      ...realSettingsFs,
      writeJsonAtomic: (path, value) => writeJsonAtomic(path, value, busy),
    });
    await store.load();
    await expect(store.set({ zoomLevel: 1.4 })).rejects.toThrow('busy');
    expect((await make().load()).zoomLevel).toBe(2.6);
    expect(names()).toEqual(['settings.json']);
  });

  it.each(['EPERM', 'EBUSY'])(
    'retries a rename that fails with %s and then succeeds',
    async (code) => {
      let attempts = 0;
      const flaky: AtomicFs = {
        ...realAtomicFs,
        rename: (from, to) => {
          attempts += 1;
          return attempts < 3
            ? Promise.reject(Object.assign(new Error(code), { code }))
            : realAtomicFs.rename(from, to);
        },
        sleep: () => Promise.resolve(),
      };
      const store = make({
        ...realSettingsFs,
        writeJsonAtomic: (path, value) => writeJsonAtomic(path, value, flaky),
      });
      await store.load();
      await store.set({ zoomLevel: 2.1 });
      expect(attempts).toBe(3);
      expect(onDisk()).toMatchObject({ zoomLevel: 2.1 });
    },
  );
});
