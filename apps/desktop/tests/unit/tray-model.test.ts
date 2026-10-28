import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTrayMenu,
  chooseTrayIcon,
  isTrayAvailable,
  trayIconSize,
  trayTooltip,
} from '../../src/main/shell/tray-model';

describe('buildTrayMenu', () => {
  it('offers Start recording while idle and never Stop', () => {
    expect(buildTrayMenu(false).map((item) => item.id)).toEqual([
      'show',
      'start',
      'separator',
      'quit',
    ]);
  });

  it('offers Stop recording only while recording and never Start', () => {
    expect(buildTrayMenu(true).map((item) => item.id)).toEqual([
      'show',
      'stop',
      'separator',
      'quit',
    ]);
  });

  it('labels every real item', () => {
    expect(buildTrayMenu(false).map((item) => item.label)).toEqual([
      'Show Scrim',
      'Start recording',
      undefined,
      'Quit Scrim',
    ]);
    expect(buildTrayMenu(true)[1]?.label).toBe('Stop recording');
  });
});

describe('trayTooltip', () => {
  it('says when it is recording', () => {
    expect(trayTooltip(true)).toBe('Scrim is recording');
    expect(trayTooltip(false)).toBe('Scrim');
  });
});

describe('trayIconSize', () => {
  it.each([
    ['win32', 1, 16],
    ['win32', 1.25, 24],
    ['win32', 1.5, 24],
    ['win32', 1.75, 32],
    ['win32', 2, 32],
    ['linux', 1, 24],
    ['linux', 2, 24],
  ] as const)('%s at %f is %i', (platform, scale, size) => {
    expect(trayIconSize(platform, scale)).toBe(size);
  });
});

describe('chooseTrayIcon', () => {
  it('uses the colored mark on Windows, with a red dot while recording', () => {
    expect(chooseTrayIcon('win32', 1, false)).toEqual({
      file: join('tray', 'tray-16.png'),
      template: false,
      scaleFactor: 1,
    });
    expect(chooseTrayIcon('win32', 2, true).file).toBe(join('tray', 'tray-recording-32.png'));
  });

  it('uses 24 pixels on Linux', () => {
    expect(chooseTrayIcon('linux', 1, false).file).toBe(join('tray', 'tray-24.png'));
    expect(chooseTrayIcon('linux', 1, true).file).toBe(join('tray', 'tray-recording-24.png'));
  });

  it('uses the glyph-only template image on macOS while idle, so the menu bar can tint it', () => {
    expect(chooseTrayIcon('darwin', 2, false)).toEqual({
      file: join('tray', 'trayTemplate@2x.png'),
      template: true,
      scaleFactor: 2,
    });
  });

  it('uses the colored icon on macOS while recording, because a red dot cannot be tinted', () => {
    expect(chooseTrayIcon('darwin', 2, true)).toEqual({
      file: join('tray', 'tray-recording-32.png'),
      template: false,
      scaleFactor: 2,
    });
  });
});

describe('isTrayAvailable', () => {
  it.each([
    ['win32', {}, true],
    ['darwin', {}, true],
    ['linux', { XDG_CURRENT_DESKTOP: 'KDE' }, true],
    ['linux', { XDG_CURRENT_DESKTOP: 'XFCE' }, true],
    ['linux', { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }, false],
    ['linux', { XDG_CURRENT_DESKTOP: 'GNOME' }, false],
    ['linux', {}, false],
    ['linux', { XDG_CURRENT_DESKTOP: 'GNOME', SCRIM_TRAY: '1' }, true],
  ] as const)('%s %j -> %s', (platform, env, expected) => {
    expect(isTrayAvailable(platform, env)).toBe(expected);
  });
});
