import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import config from '../../electron-builder.config';
import {
  DEB_DEPENDS,
  DEB_RECOMMENDS,
  SANDBOX_OFF_FLAGS,
  UIOHOOK_NEEDED_LIBRARIES,
  renderTemplate,
} from '../../build/linux-package.mts';

const desktop = fileURLToPath(new URL('../..', import.meta.url));
const read = (relative: string): string => readFileSync(join(desktop, relative), 'utf8');
const values = { executable: 'scrim', sanitizedProductName: 'Scrim' };
const profile = renderTemplate(read('build/linux/apparmor-profile.tpl'), values);
const postinst = renderTemplate(read('build/linux/after-install.tpl'), values);
const postrm = renderTemplate(read('build/linux/after-remove.tpl'), values);

describe('the Linux targets', () => {
  it('builds an AppImage and a deb for x64 only', () => {
    expect(config.linux?.target).toEqual(['AppImage', 'deb']);
    expect(config.linux?.executableName).toBe('scrim');
  });

  it('keeps the mouse hook outside the asar archive', () => {
    expect(config.asarUnpack).toContain('node_modules/uiohook-napi/**');
  });

  it('wires the deb scripts and the profile from build/linux', () => {
    expect(config.deb?.afterInstall).toBe('build/linux/after-install.tpl');
    expect(config.deb?.afterRemove).toBe('build/linux/after-remove.tpl');
    expect(config.deb?.appArmorProfile).toBe('build/linux/apparmor-profile.tpl');
  });
});

describe('the deb dependencies', () => {
  const text = DEB_DEPENDS.join('\n');

  it('covers electron and the mouse hook libraries', () => {
    const byLibrary: Record<string, string> = {
      'libX11.so.6': 'libx11-6',
      'libXrandr.so.2': 'libxrandr2',
      'libXtst.so.6': 'libxtst6',
      'libXt.so.6': 'libxt6',
    };
    for (const library of UIOHOOK_NEEDED_LIBRARIES) expect(text).toContain(byLibrary[library]);
    for (const name of ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'xdg-utils']) {
      expect(text).toContain(name);
    }
    for (const name of ['libatspi2.0-0', 'libuuid1', 'libsecret-1-0']) {
      expect(text).toContain(name);
    }
  });

  it('accepts the Ubuntu 24.04 t64 package names as alternatives', () => {
    expect(DEB_DEPENDS).toContain('libgtk-3-0 | libgtk-3-0t64');
    expect(DEB_DEPENDS).toContain('libasound2 | libasound2t64');
  });

  it('passes them to the builder, with VA-API as a recommendation only', () => {
    expect(config.deb?.depends).toEqual([...DEB_DEPENDS]);
    expect(config.deb?.recommends).toEqual([...DEB_RECOMMENDS]);
    expect(DEB_DEPENDS.join(' ')).not.toContain('libva');
  });
});

describe('the AppArmor profile for Ubuntu 24.04', () => {
  it('allows user namespaces for the installed program and names its path', () => {
    expect(profile).toContain('abi <abi/4.0>,');
    expect(profile).toContain('include <tunables/global>');
    expect(profile).toContain('profile "scrim" "/opt/Scrim/scrim" flags=(unconfined) {');
    expect(profile).toMatch(/^\s+userns,$/m);
  });

  it('is loaded by the install script only when AppArmor can read it', () => {
    expect(postinst).toContain('apparmor_status --enabled');
    expect(postinst).toContain("'/opt/Scrim/resources/apparmor-profile'");
    expect(postinst).toContain("'/etc/apparmor.d/scrim'");
    expect(postinst).toContain('apparmor_parser --skip-kernel-load');
    expect(postinst).toContain('apparmor_parser --replace --write-cache --skip-read-cache');
    expect(postinst).toContain('ischroot');
  });

  it('is unloaded and deleted by the remove script', () => {
    expect(postrm).toContain("APPARMOR_PROFILE_DEST='/etc/apparmor.d/scrim'");
    expect(postrm).toContain('apparmor_parser --remove "$APPARMOR_PROFILE_DEST"');
    expect(postrm).toContain('rm -f "$APPARMOR_PROFILE_DEST"');
  });

  it('links and unlinks the command and leaves nothing else behind', () => {
    expect(postinst).toContain("'/usr/bin/scrim' 'scrim' '/opt/Scrim/scrim'");
    expect(postrm).toContain("update-alternatives --remove 'scrim' '/opt/Scrim/scrim'");
    expect(postrm).toContain("rm -f '/usr/bin/scrim'");
    // The remove script touches only these system paths.
    const touched = [...postrm.matchAll(/(?:rm -f|--remove)\s+['"]?([^'"\s]+)/g)].map((m) => m[1]);
    for (const path of touched) {
      expect(['/usr/bin/scrim', 'scrim', '$APPARMOR_PROFILE_DEST']).toContain(path);
    }
  });

  it('starts with a shell line and leaves no unfilled markers', () => {
    for (const script of [postinst, postrm]) {
      expect(script.startsWith('#!/bin/bash\n')).toBe(true);
      expect(script).not.toContain('${');
    }
    expect(profile).not.toContain('${');
  });

  it('refuses a template with an unknown marker', () => {
    expect(() => renderTemplate('${nope}', values)).toThrow(/unknown value/);
  });
});

describe('the sandbox stays on', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('has no launch argument or desktop entry that turns it off', () => {
    const linux = JSON.stringify(config.linux) + JSON.stringify(config.deb);
    for (const flag of SANDBOX_OFF_FLAGS) {
      expect(linux).not.toContain(flag);
      for (const script of [profile, postinst, postrm]) expect(script).not.toContain(flag);
    }
    expect(config.linux?.desktop).not.toHaveProperty('Exec');
    const entry = JSON.stringify(config.linux?.desktop);
    expect(entry).not.toContain('sandbox');
  });

  it('is not switched off anywhere in the app sources or the build files', () => {
    const files = [...walk(join(desktop, 'src')), ...walk(join(desktop, 'build'))].filter((file) =>
      /\.(ts|tsx|mts|tpl)$/.test(file),
    );
    for (const file of files) {
      if (file.endsWith('linux-package.mts')) continue;
      const text = readFileSync(file, 'utf8');
      for (const flag of SANDBOX_OFF_FLAGS) expect(text, file).not.toContain(flag);
      expect(text, file).not.toMatch(/appendSwitch\(\s*['"](?:no-sandbox|disable-setuid-sandbox)/);
    }
  });

  it('does not let the packaged app read the flag from the environment', () => {
    expect(read('package.json')).not.toContain('no-sandbox');
  });
});

describe('the fuses are flipped on the Linux binary', () => {
  it('uses the executable name that electron-builder gives the Linux app', async () => {
    const flip = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock('@electron/fuses', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      flipFuses: flip,
    }));
    const { afterPack } = await import('../../build/after-pack.ts');
    await afterPack({
      electronPlatformName: 'linux',
      appOutDir: '/out/linux-unpacked',
      packager: { appInfo: { productFilename: 'Scrim' }, executableName: 'scrim' },
    } as never);
    expect(String(flip.mock.calls[0]?.[0]).replaceAll('\\', '/')).toBe('/out/linux-unpacked/scrim');
    vi.doUnmock('@electron/fuses');
  });
});
