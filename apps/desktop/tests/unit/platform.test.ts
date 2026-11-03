import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlatform,
  currentPlatform,
  setPlatformOverride,
} from '../../src/main/platform/platform';
import {
  defaultFolderLabel,
  displayPath,
  platformInfoSchema,
  WAYLAND_CURSOR_NOTE,
} from '../../src/shared/platform-info';

const windows = () =>
  createPlatform({ platform: 'win32', env: { LOCALAPPDATA: 'C:/Users/me/AppData/Local' } });
const linux = (env: Record<string, string>) => createPlatform({ platform: 'linux', env });

describe('the Windows adapter', () => {
  it('keeps the behavior the app had before the platform module', () => {
    const p = windows();
    expect(p.os).toBe('windows');
    expect(p.session).toBeNull();
    expect(p.fileManager).toBe('Explorer');
    expect(p.capture).toEqual({ mode: 'enumerate', areaChooser: 'overlay', settleMs: 180 });
    expect(p.mouseHook).toEqual({ available: true, note: null });
    expect(p.globalShortcuts).toEqual({ mayFail: false, note: null });
    expect(p.hidesWindowsFromCapture).toBe(true);
    expect(p.shareSheet).toBe(true);
    expect(p.taskbarRecordingMark).toBe(true);
    expect(p.trayNeedsIndicatorHost).toBe(false);
    expect(p.startupSwitches).toEqual([]);
  });

  it('keeps projects under the local app data folder, and recordings under Videos', () => {
    const p = windows();
    expect(p.folders.projectsRoot('C:/Roaming/Scrim')).toBe(
      join('C:/Users/me/AppData/Local', 'Scrim', 'Projects'),
    );
    expect(p.folders.recordings('C:/Users/me/Videos')).toBe(join('C:/Users/me/Videos', 'Scrim'));
    expect(p.folders.screenshots('C:/Users/me/Pictures')).toBe(
      join('C:/Users/me/Pictures', 'Scrim'),
    );
  });
});

describe('the Linux adapter on X11', () => {
  const p = linux({ XDG_SESSION_TYPE: 'x11' });
  it('works like Windows where the mouse, the shortcuts and the overlay are concerned', () => {
    expect(p.session).toBe('x11');
    expect(p.fileManager).toBe('Files');
    expect(p.capture.mode).toBe('enumerate');
    expect(p.capture.areaChooser).toBe('overlay');
    expect(p.mouseHook.available).toBe(true);
    expect(p.globalShortcuts.mayFail).toBe(false);
    expect(p.startupSwitches).toEqual([]);
  });
  it('cannot hide windows from capture, has no share sheet and no taskbar mark', () => {
    expect(p.hidesWindowsFromCapture).toBe(false);
    expect(p.shareSheet).toBe(false);
    expect(p.taskbarRecordingMark).toBe(false);
    expect(p.trayNeedsIndicatorHost).toBe(true);
    expect(p.capture.settleMs).toBeGreaterThan(180);
  });
  it('puts working files in the user data folder, with forward slashes', () => {
    expect(p.folders.projectsRoot('/home/me/.config/Scrim')).toBe(
      join('/home/me/.config/Scrim', 'Projects'),
    );
    expect(p.folders.recordings('/home/me/Videos')).toBe(join('/home/me/Videos', 'Scrim'));
  });
});

describe('the Linux adapter on Wayland', () => {
  const p = linux({ XDG_SESSION_TYPE: 'wayland' });
  it('captures through the portal and chooses on a still frame', () => {
    expect(p.capture.mode).toBe('portal');
    expect(p.capture.areaChooser).toBe('still-frame');
    expect(p.startupSwitches.length).toBeGreaterThan(0);
  });
  it('has no mouse hook and says why in plain words', () => {
    expect(p.mouseHook).toEqual({ available: false, note: WAYLAND_CURSOR_NOTE });
    expect(p.info().cursorEffects).toBe(false);
    expect(p.info().cursorEffectsNote).toBe(WAYLAND_CURSOR_NOTE);
  });
  it('warns that global shortcuts may not register', () => {
    expect(p.globalShortcuts.mayFail).toBe(true);
    expect(p.info().shortcutsNote).toContain('system tray');
  });
});

describe('the Linux adapter on an unknown session', () => {
  const p = linux({});
  it('is not guessed: it behaves as X11 for capture and offers no note', () => {
    expect(p.session).toBe('unknown');
    expect(p.capture.mode).toBe('enumerate');
    expect(p.mouseHook.available).toBe(true);
    expect(p.info().cursorEffectsNote).toBeNull();
    expect(p.info().shortcutsNote).toBeNull();
  });
});

describe('macOS keeps the generic adapter', () => {
  it('has the Finder, a share sheet and a normal capture', () => {
    const p = createPlatform({ platform: 'darwin', env: {} });
    expect(p.os).toBe('macos');
    expect(p.fileManager).toBe('Finder');
    expect(p.shareSheet).toBe(true);
    expect(p.hidesWindowsFromCapture).toBe(true);
    expect(p.capture.mode).toBe('enumerate');
  });
});

describe('info for the page', () => {
  it.each([windows(), linux({ XDG_SESSION_TYPE: 'wayland' }), linux({})])(
    'matches the schema',
    (p) => {
      expect(platformInfoSchema.safeParse(p.info()).success).toBe(true);
    },
  );
});

describe('the current platform and the test override', () => {
  afterEach(() => {
    setPlatformOverride(undefined);
  });
  it('uses the override while it is set', () => {
    const fake = linux({ XDG_SESSION_TYPE: 'wayland' });
    setPlatformOverride(fake);
    expect(currentPlatform()).toBe(fake);
    setPlatformOverride(undefined);
    expect(currentPlatform()).not.toBe(fake);
  });
});

describe('paths and labels the person reads', () => {
  const win = windows().info();
  const lin = linux({ XDG_SESSION_TYPE: 'x11' }).info();
  it('names default folders with the system separator', () => {
    expect(defaultFolderLabel('Videos', win)).toBe('Videos\\Scrim');
    expect(defaultFolderLabel('Pictures', lin)).toBe('Pictures/Scrim');
  });
  it('shows real forward slashes on Linux and backslashes on Windows', () => {
    expect(displayPath('C:\\Users\\me\\Videos\\Scrim', lin)).toBe('C:/Users/me/Videos/Scrim');
    expect(displayPath('/home/me/Videos/Scrim', lin)).toBe('/home/me/Videos/Scrim');
    expect(displayPath('C:/Users/me/Videos', win)).toBe('C:\\Users\\me\\Videos');
  });
  it('says Files on Linux and Explorer on Windows', () => {
    expect(lin.fileManager).toBe('Files');
    expect(win.fileManager).toBe('Explorer');
  });
});
