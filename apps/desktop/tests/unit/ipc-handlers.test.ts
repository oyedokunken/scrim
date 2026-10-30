import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHandlers, isInsideKnownFolder, type HandlerDeps } from '../../src/main/ipc/handlers';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';
import { fakeRecording } from './support/recording-api-fake';

const DEST = process.platform === 'win32' ? 'C:\\Recordings' : '/recordings';
const inDest = (...parts: string[]) => join(DEST, ...parts);

function setup(overrides: Partial<HandlerDeps> = {}, destinationFolder: string | null = DEST) {
  let settings: Settings = { ...DEFAULT_SETTINGS, destinationFolder };
  const deps: HandlerDeps = {
    settings: {
      get: () => settings,
      set: (patch) => {
        settings = { ...settings, ...(patch as Partial<Settings>) };
        return Promise.resolve(settings);
      },
      load: () => Promise.resolve(settings),
    },
    recording: fakeRecording(),
    area: {
      run: vi.fn(() => Promise.resolve({ ok: false as const, reason: 'cancelled' as const })),
      cancel: vi.fn(),
    },
    defaultScreenshotFolder: () => 'PICTURES',
    defaultRecordingsFolder: () => 'VIDEOS',
    ensureFolder: vi.fn(() => Promise.resolve()),
    images: {
      readFile: vi.fn(() => Promise.resolve(Buffer.from([]))),
      writeNewFile: vi.fn(() => Promise.resolve()),
      writeChosenFile: vi.fn(() => Promise.resolve()),
      exists: vi.fn(() => Promise.resolve(false)),
      copyImage: vi.fn(),
      chooseSavePath: vi.fn(() => Promise.resolve(null)),
      startDrag: vi.fn(),
      trash: vi.fn(() => Promise.resolve()),
      listFolder: vi.fn(() => Promise.resolve([])),
      readHead: vi.fn(() => Promise.resolve(Buffer.from([]))),
      thumbnail: vi.fn(() => 'data:image/png;base64,AA=='),
    },
    library: {
      list: vi.fn(() => Promise.resolve([])),
      thumbnail: vi.fn(() => Promise.resolve(null)),
      open: vi.fn(() => Promise.resolve({ kind: 'missing' as const })),
      rename: vi.fn(() => Promise.resolve({ ok: true })),
      lookup: vi.fn(() => Promise.resolve(null)),
      preview: vi.fn(() => Promise.resolve(null)),
      play: vi.fn(() => Promise.resolve(true)),
      openFile: vi.fn(() => Promise.resolve(true)),
      fileOf: vi.fn(() => undefined),
      reveal: vi.fn(),
      remove: vi.fn(() => Promise.resolve()),
      share: vi.fn(() => Promise.resolve()),
    },
    share: null,
    shareService: {
      isAllowed: vi.fn(() => true),
      info: vi.fn(() =>
        Promise.resolve({ ok: false as const, reason: 'missing' as const, message: 'x' }),
      ),
      run: vi.fn(() => Promise.resolve({ ok: true as const, message: 'x' })),
      drag: vi.fn(() => Promise.resolve()),
    },
    shortcutStatus: () => [],
    exporter: {
      start: vi.fn(),
      cancel: vi.fn(),
      retrySafer: vi.fn(),
      latest: vi.fn(),
      reveal: vi.fn(() => Promise.resolve(true)),
    },
    closeAnswer: vi.fn(),
    shortcutsSuspend: vi.fn(),
    legacy: {
      count: vi.fn(() => Promise.resolve(2)),
      move: vi.fn(() => Promise.resolve({ moved: 2, failed: 0 })),
    },
    editor: {
      loadSource: vi.fn(() => Promise.resolve({ ok: false as const, reason: 'missing' as const })),
      writeEdits: vi.fn(() => Promise.resolve()),
      isKnownFolder: () => false,
    },
    review: {
      'review:open': () =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'unknown' as const, message: 'm', nextStep: 'n' },
        }),
      'review:discard': () => Promise.resolve({ ok: true as const, value: undefined }),
    },
    platform: process.platform,
    version: '1.0.0',
    chooseFolder: vi.fn(() => Promise.resolve(null)),
    showItemInFolder: vi.fn(),
    openPath: vi.fn(() => Promise.resolve('')),
    openExternal: vi.fn(() => Promise.resolve(true)),
    logsFolder: 'LOGS',
    openSecuritySettings: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  };
  return { handlers: createHandlers(deps), deps };
}

describe('isInsideKnownFolder', () => {
  const folders = [DEST];

  it('accepts a file or folder inside a known folder', () => {
    expect(isInsideKnownFolder(inDest('take 1', 'screen.webm'), folders, process.platform)).toBe(
      true,
    );
    expect(isInsideKnownFolder(DEST, folders, process.platform)).toBe(true);
  });

  it.each([
    ['dot dot out of the folder', () => join(DEST, '..', 'secret.txt')],
    [
      'dot dot hidden in the middle',
      () =>
        `${DEST}${process.platform === 'win32' ? '\\' : '/'}a${process.platform === 'win32' ? '\\' : '/'}..${process.platform === 'win32' ? '\\' : '/'}..${process.platform === 'win32' ? '\\' : '/'}x`,
    ],
    [
      'a sibling that shares the prefix',
      () => `${DEST}-evil${process.platform === 'win32' ? '\\' : '/'}x.webm`,
    ],
    ['a relative path', () => 'take 1/screen.webm'],
    ['an empty path', () => ''],
    ['a null byte', () => `${inDest('a')}\0.webm`],
    [
      'another place entirely',
      () => (process.platform === 'win32' ? 'D:\\Other\\a.webm' : '/etc/passwd'),
    ],
  ])('rejects %s', (_name, build) => {
    expect(isInsideKnownFolder(build(), folders, process.platform)).toBe(false);
  });

  it('ignores case on Windows and macOS only', () => {
    const shouting = join(DEST.toUpperCase(), 'a.webm');
    expect(isInsideKnownFolder(shouting, folders, 'win32')).toBe(process.platform === 'win32');
    expect(isInsideKnownFolder(shouting, ['/recordings'], 'linux')).toBe(false);
  });

  it('accepts nothing when there are no known folders', () => {
    expect(isInsideKnownFolder(inDest('a'), [], process.platform)).toBe(false);
  });
});

describe('the handlers', () => {
  it('reads and changes settings through the store', async () => {
    const { handlers } = setup();
    expect((await handlers['settings:get'](undefined)).zoomLevel).toBe(DEFAULT_SETTINGS.zoomLevel);
    expect((await handlers['settings:set']({ zoomLevel: 2.4 })).zoomLevel).toBe(2.4);
    expect((await handlers['settings:get'](undefined)).zoomLevel).toBe(2.4);
  });

  it('hands back the folder the person chose, or null', async () => {
    const { handlers } = setup({ chooseFolder: () => Promise.resolve('C:\\Chosen') });
    expect(await handlers['folder:choose']({ kind: 'recordings' })).toBe('C:\\Chosen');
    expect(await setup().handlers['folder:choose']({ kind: 'recordings' })).toBeNull();
  });

  it('saves each chosen folder in its own setting, and starts the picker where it is now', async () => {
    const chooseFolder = vi.fn(() => Promise.resolve('C:\\Chosen'));
    const { handlers } = setup({ chooseFolder }, null);
    await handlers['folder:choose']({ kind: 'recordings' });
    expect(chooseFolder).toHaveBeenLastCalledWith('VIDEOS');
    expect((await handlers['settings:get'](undefined)).destinationFolder).toBe('C:\\Chosen');
    expect((await handlers['settings:get'](undefined)).screenshotFolder).toBeNull();
    await handlers['folder:choose']({ kind: 'screenshots' });
    expect(chooseFolder).toHaveBeenLastCalledWith('PICTURES');
    expect((await handlers['settings:get'](undefined)).screenshotFolder).toBe('C:\\Chosen');
  });

  it('keeps the settings when the picker is cancelled', async () => {
    const { handlers } = setup({}, null);
    await handlers['folder:choose']({ kind: 'screenshots' });
    expect((await handlers['settings:get'](undefined)).screenshotFolder).toBeNull();
  });

  it('opens the chosen or default folder, creating it first', async () => {
    const { handlers, deps } = setup({}, null);
    await handlers['folder:open']({ kind: 'recordings' });
    expect(deps.ensureFolder).toHaveBeenLastCalledWith('VIDEOS');
    expect(deps.openPath).toHaveBeenLastCalledWith('VIDEOS');
    await handlers['folder:open']({ kind: 'screenshots' });
    expect(deps.openPath).toHaveBeenLastCalledWith('PICTURES');
    const failing = setup({ openPath: () => Promise.resolve('no') });
    await expect(failing.handlers['folder:open']({ kind: 'recordings' })).rejects.toThrow();
  });

  it('refuses two shortcuts on the same keys, in any case, and keeps the old settings', async () => {
    const { handlers } = setup();
    expect(() => handlers['settings:set']({ shortcutStop: 'commandorcontrol+shift+r' })).toThrow();
    expect((await handlers['settings:get'](undefined)).shortcutStop).toBe(
      DEFAULT_SETTINGS.shortcutStop,
    );
    const ok = await handlers['settings:set']({ shortcutStop: 'CommandOrControl+Alt+S' });
    expect(ok.shortcutStop).toBe('CommandOrControl+Alt+S');
  });

  it('says which shortcuts another program owns', () => {
    const { handlers } = setup({ shortcutStatus: () => ['stop'] });
    expect(handlers['shortcuts:status'](undefined)).toEqual({ unavailable: ['stop'] });
  });

  it('passes the answer to the close question on', () => {
    const { handlers, deps } = setup();
    void handlers['window:close-answer']({ answer: 'stop' });
    expect(deps.closeAnswer).toHaveBeenCalledWith('stop');
  });

  it('suspends the global shortcuts while a key is chosen', () => {
    const { handlers, deps } = setup();
    void handlers['shortcuts:suspend']({ suspended: true });
    expect(deps.shortcutsSuspend).toHaveBeenCalledWith(true);
  });

  it('counts and moves old working folders, and nothing else', async () => {
    const { handlers, deps } = setup();
    expect(await handlers['legacy:count'](undefined)).toBe(2);
    expect(await handlers['legacy:move'](undefined)).toEqual({ moved: 2, failed: 0 });
    expect(deps.legacy.move).toHaveBeenCalledTimes(1);
  });

  it('reports the app version it was given', () => {
    expect(setup().handlers['app:version'](undefined)).toBe('1.0.0');
  });

  it('opens an allowed link and refuses one the opener turns down', async () => {
    const { handlers, deps } = setup();
    await handlers['shell:open-external']({ url: 'https://github.com/oyedokunken/scrim' });
    await handlers['shell:open-external']({ url: 'https://www.oyedokun.dev/' });
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/oyedokunken/scrim');

    const refused = setup({ openExternal: () => Promise.resolve(false) });
    await expect(
      refused.handlers['shell:open-external']({ url: 'https://github.com/oyedokunken/scrim' }),
    ).rejects.toThrow();
  });

  it('shows a file in its folder only inside the destination folder', async () => {
    const { handlers, deps } = setup();
    await handlers['shell:show-in-folder']({ path: inDest('take 1', 'screen.webm') });
    expect(deps.showItemInFolder).toHaveBeenCalledWith(inDest('take 1', 'screen.webm'));

    expect(() => handlers['shell:show-in-folder']({ path: join(DEST, '..', 'x') })).toThrow();
    expect(deps.showItemInFolder).toHaveBeenCalledTimes(1);
  });

  it('refuses to show anything when no destination is set', () => {
    const { handlers, deps } = setup({}, null);
    expect(() => handlers['shell:show-in-folder']({ path: inDest('a') })).toThrow();
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it('also accepts folders the app adds, such as a session being recorded', async () => {
    const extra = process.platform === 'win32' ? 'E:\\Sessions' : '/sessions';
    const { handlers, deps } = setup({ extraKnownFolders: () => [extra] }, null);
    await handlers['shell:show-in-folder']({ path: join(extra, 'one') });
    expect(deps.showItemInFolder).toHaveBeenCalled();
  });

  it('opens the fixed logs folder, never one the caller names', async () => {
    const { handlers, deps } = setup();
    await handlers['logs:open-folder'](undefined);
    expect(deps.openPath).toHaveBeenCalledWith('LOGS');
  });

  it('reports a logs folder that could not be opened', async () => {
    const { handlers } = setup({ openPath: () => Promise.resolve('no such folder') });
    await expect(handlers['logs:open-folder'](undefined)).rejects.toThrow();
  });
});
