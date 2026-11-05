import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LinuxAppImageSteps, LinuxVerify } from '@/components/sections/linux-help';
import {
  APPIMAGE_PROFILE_COMMANDS,
  APPIMAGE_PROFILE_FILE,
  APPIMAGE_PROFILE_FOLDER,
  APPIMAGE_RUN_COMMANDS,
  APPIMAGE_SANDBOX_COMMANDS,
  spacedFingerprint,
  verifyCommands,
} from '@/lib/linux-help';
import { SYSTEMS } from '@/lib/systems';
import { siteConfig } from '@/site.config';

const linux = SYSTEMS.find((system) => system.os === 'linux');

describe('the Linux first run help', () => {
  const help = linux?.help.join(' ') ?? '';

  it('covers chmod, the Ubuntu 24.04 sandbox, X11, Wayland and the testing sentence', () => {
    expect(help).toContain('chmod +x');
    expect(help).toContain('Ubuntu 24.04');
    expect(help).toContain('On X11 you get everything.');
    expect(help).toMatch(/On Wayland, auto zoom and cursor effects are off/);
    expect(help).toMatch(/system screen sharing portal/);
    expect(help).toContain(
      'This build has had less testing than Windows. If something breaks, open an issue.',
    );
  });

  it('offers the AppImage and the deb', () => {
    expect(linux?.summary).toBe('An AppImage and a deb package for 64 bit Linux.');
  });
});

describe('the AppImage steps', () => {
  const html = renderToStaticMarkup(<LinuxAppImageSteps />);

  it('gives the exact commands and warns what the system setting changes', () => {
    expect(html).toContain('chmod +x');
    expect(html).toContain(APPIMAGE_SANDBOX_COMMANDS.now);
    expect(html).toContain('kernel.apparmor_restrict_unprivileged_userns=0');
    expect(html).toContain('for the whole computer');
    expect(html).toContain('put the limit back');
    expect(html).toContain('The sandbox stays on');
  });

  it('never tells anyone to turn the sandbox off', () => {
    const everything = [
      html,
      ...APPIMAGE_RUN_COMMANDS,
      ...Object.values(APPIMAGE_SANDBOX_COMMANDS),
    ].join('\n');
    expect(everything).not.toContain('no-sandbox');
    expect(everything).not.toContain('disable-setuid-sandbox');
  });
});

describe('the Scrim only AppArmor profile for an AppImage', () => {
  const html = renderToStaticMarkup(<LinuxAppImageSteps />);
  const profile = APPIMAGE_PROFILE_COMMANDS.write.join('\n');

  it('allows user namespaces for one program and nothing else', () => {
    expect(profile).toContain('userns,');
    expect(profile).toContain(`profile scrim-appimage ${APPIMAGE_PROFILE_FOLDER}/scrim`);
    expect(profile).toContain('flags=(unconfined)');
    expect(profile).not.toContain('/**');
    expect(profile).not.toContain('capability');
  });

  it('is the same shape as the profile the deb installs', () => {
    expect(profile).toContain('abi <abi/4.0>,');
    expect(profile).toContain('include <tunables/global>');
    expect(profile).toContain('include if exists <local/scrim-appimage>');
  });

  it('is recommended before the whole computer setting, with a way to remove it', () => {
    expect(html).toContain(APPIMAGE_PROFILE_COMMANDS.load);
    expect(html).toContain('--appimage-extract');
    expect(html).toContain(APPIMAGE_PROFILE_FILE);
    expect(html.indexOf(APPIMAGE_PROFILE_COMMANDS.load)).toBeLessThan(
      html.indexOf(APPIMAGE_SANDBOX_COMMANDS.now),
    );
    expect(APPIMAGE_PROFILE_COMMANDS.remove.join('\n')).toContain('apparmor_parser -R');
  });
});

describe('verifying a download', () => {
  it('is two commands: import the key, then gpg --verify', () => {
    expect(verifyCommands()).toEqual([
      'gpg --import scrim-release-key.asc',
      'gpg --verify <file>.asc <file>',
    ]);
  });

  it('shows how to read the fingerprint from the repository while none is set', () => {
    expect(siteConfig.linuxSigningFingerprint).toBe('');
    const html = renderToStaticMarkup(<LinuxVerify />);
    expect(html).toContain('gpg --import scrim-release-key.asc');
    expect(html).toContain('gpg --show-keys --fingerprint scrim-release-key.asc');
    expect(html).toContain(siteConfig.linuxKeyUrl);
    expect(html).not.toMatch(/[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}/);
  });

  it('formats a real fingerprint in groups of four and rejects anything else', () => {
    expect(spacedFingerprint('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567',
    );
    expect(spacedFingerprint('')).toBe('');
    expect(spacedFingerprint('not a fingerprint')).toBe('');
    expect(spacedFingerprint('0123 4567')).toBe('');
  });

  it('points at the key file the release workflow verifies against', () => {
    expect(siteConfig.linuxKeyUrl.endsWith('/docs/scrim-release-key.asc')).toBe(true);
  });
});
