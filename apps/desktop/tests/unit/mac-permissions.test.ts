import { describe, expect, it, vi } from 'vitest';
import {
  MAC_SETTINGS_URLS,
  macPermissionSteps,
  openMacSettings,
  readMacPermissions,
} from '../../src/main/platform/mac-permissions';

describe('readMacPermissions', () => {
  it('reads the four permissions and maps odd values to unknown', () => {
    const permissions = readMacPermissions({
      mediaAccess: (kind) =>
        kind === 'screen' ? 'granted' : kind === 'camera' ? 'denied' : 'weird',
      accessibilityTrusted: () => true,
    });
    expect(permissions).toEqual({
      screen: 'granted',
      camera: 'denied',
      microphone: 'unknown',
      accessibility: true,
    });
  });
});

describe('macPermissionSteps', () => {
  const base = {
    screen: 'not-determined',
    camera: 'granted',
    microphone: 'granted',
    accessibility: false,
  } as const;

  it('requires Screen Recording and treats Accessibility as optional', () => {
    const [screen, accessibility] = macPermissionSteps(base);
    expect(screen).toMatchObject({ permission: 'screen', required: true, granted: false });
    expect(accessibility).toMatchObject({
      permission: 'accessibility',
      required: false,
      granted: false,
    });
    expect(screen?.help).toContain('quit and open Scrim again');
    expect(accessibility?.help).toContain('cursor effects and auto zoom');
  });

  it('marks granted steps and explains a restricted Mac', () => {
    const granted = macPermissionSteps({ ...base, screen: 'granted', accessibility: true });
    expect(granted.every((step) => step.granted)).toBe(true);
    const restricted = macPermissionSteps({ ...base, screen: 'restricted' });
    expect(restricted[0]?.help).toContain('Ask whoever manages the Mac');
  });
});

describe('openMacSettings', () => {
  it('opens only the fixed settings panes, and only on macOS', async () => {
    const open = vi.fn(() => Promise.resolve());
    expect(await openMacSettings('screen', 'darwin', open)).toBe(true);
    expect(open).toHaveBeenCalledWith(MAC_SETTINGS_URLS.screen);
    expect(await openMacSettings('screen', 'win32', open)).toBe(false);
    expect(await openMacSettings('accessibility', 'linux', open)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps every pane URL on the system settings scheme', () => {
    for (const url of Object.values(MAC_SETTINGS_URLS)) {
      expect(url.startsWith('x-apple.systempreferences:com.apple.preference.security?')).toBe(true);
    }
  });
});
