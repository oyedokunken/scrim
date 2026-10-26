import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHandlers, isInsideKnownFolder, type HandlerDeps } from '../../src/main/ipc/handlers';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';

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
    platform: process.platform,
    chooseFolder: vi.fn(() => Promise.resolve(null)),
    showItemInFolder: vi.fn(),
    openPath: vi.fn(() => Promise.resolve('')),
    openExternal: vi.fn(() => Promise.resolve(true)),
    logsFolder: 'LOGS',
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
    expect(await handlers['folder:choose'](undefined)).toBe('C:\\Chosen');
    expect(await setup().handlers['folder:choose'](undefined)).toBeNull();
  });

  it('opens an allowed link and refuses one the opener turns down', async () => {
    const { handlers, deps } = setup();
    await handlers['shell:open-external']({ url: 'https://github.com/oyedokunken/scrim' });
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
