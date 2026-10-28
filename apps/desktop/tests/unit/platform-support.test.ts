import { describe, expect, it } from 'vitest';
import {
  describePlatformSupport,
  linuxSessionOf,
  platformSwitches,
} from '../../src/main/platform/platform-support';

describe('linuxSessionOf', () => {
  it.each([
    [{ XDG_SESSION_TYPE: 'wayland' }, 'wayland'],
    [{ XDG_SESSION_TYPE: 'x11' }, 'x11'],
    [{ XDG_SESSION_TYPE: 'X11' }, 'x11'],
    [{ WAYLAND_DISPLAY: 'wayland-0' }, 'wayland'],
    [{ DISPLAY: ':0' }, 'x11'],
    [{ XDG_SESSION_TYPE: 'tty', DISPLAY: ':0' }, 'unknown'],
    [{}, 'unknown'],
  ] as const)('reads %j as %s', (env, expected) => {
    expect(linuxSessionOf(env)).toBe(expected);
  });
});

describe('describePlatformSupport', () => {
  it('turns cursor effects off on Wayland and says why in plain words', () => {
    const support = describePlatformSupport({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland' },
    });
    expect(support.cursorEffects).toBe(false);
    expect(support.cursorEffectsNote).toContain('Wayland');
    expect(support.cursorEffectsNote).toContain('X11');
    expect(support.captureNeedsSystemPrompt).toBe(true);
  });

  it('gives X11 everything', () => {
    const support = describePlatformSupport({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'x11' },
    });
    expect(support.cursorEffects).toBe(true);
    expect(support.cursorEffectsNote).toBeUndefined();
    expect(support.modifierLabel).toBe('Ctrl');
  });

  it('does not switch effects off for an unknown Linux session', () => {
    expect(describePlatformSupport({ platform: 'linux', env: {} }).cursorEffects).toBe(true);
  });

  it('uses Cmd and a capture prompt on macOS, Ctrl and no prompt on Windows', () => {
    const mac = describePlatformSupport({ platform: 'darwin', env: {} });
    expect(mac).toMatchObject({
      modifierLabel: 'Cmd',
      captureNeedsSystemPrompt: true,
      cursorEffects: true,
    });
    const win = describePlatformSupport({ platform: 'win32', env: {} });
    expect(win).toMatchObject({ modifierLabel: 'Ctrl', captureNeedsSystemPrompt: false });
  });
});

describe('platformSwitches', () => {
  it('asks for native Wayland and the PipeWire capturer on a Wayland session only', () => {
    expect(platformSwitches({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' } })).toEqual([
      ['ozone-platform-hint', 'auto'],
      ['enable-features', 'WebRTCPipeWireCapturer'],
    ]);
    expect(platformSwitches({ platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' } })).toEqual([]);
    expect(platformSwitches({ platform: 'darwin', env: { XDG_SESSION_TYPE: 'wayland' } })).toEqual(
      [],
    );
    expect(platformSwitches({ platform: 'win32', env: {} })).toEqual([]);
  });
});
