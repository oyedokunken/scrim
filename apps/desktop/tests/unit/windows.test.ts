import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { devDockIconPath, windowIconFile, windowIconPath } from '../../src/main/app-icon';
import { APP_ID } from '../../src/shared/app-id';

vi.mock('electron', () => ({ app: { getAppPath: () => '/app' }, BrowserWindow: vi.fn() }));

const { buildWindowOptions } = await import('../../src/main/windows/create-window');
const { SECURE_WEB_PREFERENCES } = await import('../../src/main/security');
const builderConfig = (await import('../../electron-builder.config')).default;

const srcMain = join(__dirname, '../../src/main');
const iconsDir = join(__dirname, '../../resources/icons');

describe('window icon per platform', () => {
  it.each([
    ['win32', 'icon.ico'],
    ['linux', join('linux', '256x256.png')],
    ['darwin', undefined],
    ['freebsd', join('linux', '256x256.png')],
  ] as const)('%s -> %s', (platform, expected) => {
    expect(windowIconFile(platform)).toBe(expected);
  });

  it('points at a file that exists for every platform that sets one', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const file = windowIconFile(platform);
      expect(file).toBeDefined();
      expect(statSync(join(iconsDir, file ?? '')).size).toBeGreaterThan(0);
    }
  });

  it('builds absolute paths under resources/icons', () => {
    expect(windowIconPath('win32', join('C:', 'app'))).toBe(
      join('C:', 'app', 'resources', 'icons', 'icon.ico'),
    );
    expect(windowIconPath('darwin', '/app')).toBeUndefined();
    expect(devDockIconPath('/app')).toBe(join('/app', 'resources', 'icons', 'icon-mac-512.png'));
  });
});

describe('buildWindowOptions', () => {
  it('sets the icon on Windows and Linux and leaves macOS to the bundle', () => {
    expect(buildWindowOptions({}, 'app', 'win32', '/app').icon).toBe(
      join('/app', 'resources', 'icons', 'icon.ico'),
    );
    expect(buildWindowOptions({}, 'app', 'linux', '/app').icon).toBe(
      join('/app', 'resources', 'icons', 'linux', '256x256.png'),
    );
    expect(buildWindowOptions({}, 'app', 'darwin', '/app')).not.toHaveProperty('icon');
  });

  it('keeps helper windows out of the taskbar and app windows in it', () => {
    expect(buildWindowOptions({}, 'helper', 'win32', '/app').skipTaskbar).toBe(true);
    expect(buildWindowOptions({}, 'app', 'win32', '/app')).not.toHaveProperty('skipTaskbar');
  });

  it('lets a caller add preferences but never weaken the baseline', () => {
    const options = buildWindowOptions(
      { webPreferences: { preload: '/p.js', sandbox: false, nodeIntegration: true } },
      'app',
      'linux',
      '/app',
    );
    expect(options.webPreferences).toMatchObject({ ...SECURE_WEB_PREFERENCES, preload: '/p.js' });
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
  });

  it('passes the caller options through', () => {
    expect(buildWindowOptions({ width: 10 }, 'app', 'linux', '/app').width).toBe(10);
  });
});

describe('every window goes through the factory', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : entry.name.endsWith('.ts')
          ? [join(dir, entry.name)]
          : [],
    );

  it('creates a BrowserWindow in one file only', () => {
    const creators = files(srcMain).filter((file) =>
      /new\s+BrowserWindow\s*\(/.test(readFileSync(file, 'utf8')),
    );
    expect(creators.map((file) => file.replace(srcMain, '').replaceAll('\\', '/'))).toEqual([
      '/windows/create-window.ts',
    ]);
  });
});

describe('packaging', () => {
  it('uses the same application id as the main process', () => {
    expect(builderConfig.appId).toBe(APP_ID);
  });

  it('brands the app, the installer and the uninstaller on every system', () => {
    expect(builderConfig.win?.icon).toBe('resources/icons/icon.ico');
    expect(builderConfig.nsis?.installerIcon).toBe('resources/icons/icon.ico');
    expect(builderConfig.nsis?.uninstallerIcon).toBe('resources/icons/icon.ico');
    expect(builderConfig.nsis?.installerHeaderIcon).toBe('resources/icons/icon.ico');
    expect(builderConfig.mac?.icon).toBe('resources/icons/icon.icns');
    expect(builderConfig.linux?.icon).toBe('resources/icons/linux');
  });

  it('ships the icons inside the app so windows can load them', () => {
    expect(builderConfig.files).toContain('resources/icons/**');
  });
});
