import { describe, expect, it } from 'vitest';
import { createUpdateController } from '../../src/main/updates/update-controller';
import { updateModeFor } from '../../src/main/updates/update-mode';
import { isAllowedExternalUrl } from '../../src/shared/external-urls';
import { RELEASE_PAGE_URL, updateSnapshotSchema } from '../../src/shared/updates-contract';

const noop = () => undefined;

describe('how a copy updates', () => {
  const packaged = { isPackaged: true, hasTestFeed: false };

  it('tells a deb install from an AppImage by the APPIMAGE variable on Linux only', () => {
    expect(updateModeFor({ ...packaged, platform: 'linux', env: {} })).toBe('notice');
    expect(
      updateModeFor({ ...packaged, platform: 'linux', env: { APPIMAGE: '/x/Scrim.AppImage' } }),
    ).toBe('auto');
  });

  it('keeps Windows and macOS on the automatic updater, whatever the environment says', () => {
    expect(updateModeFor({ ...packaged, platform: 'win32', env: {} })).toBe('auto');
    expect(updateModeFor({ ...packaged, platform: 'darwin', env: {} })).toBe('auto');
  });

  it('has no updates for a copy run from source, unless a test feed is set', () => {
    const dev = { isPackaged: false, platform: 'linux', env: {} };
    expect(updateModeFor({ ...dev, hasTestFeed: false })).toBe('unsupported');
    expect(updateModeFor({ ...dev, hasTestFeed: true })).toBe('auto');
  });
});

describe('the update flow for a deb install', () => {
  function build(manualOnly: boolean) {
    const calls: string[] = [];
    const controller = createUpdateController({
      updater: {
        checkForUpdates: () =>
          Promise.resolve({
            isUpdateAvailable: true,
            updateInfo: { version: '1.3.0', releaseNotes: 'Notes' },
          }),
        downloadUpdate: () => {
          calls.push('download');
          return Promise.resolve();
        },
        quitAndInstall: () => {
          calls.push('install');
        },
        onProgress: noop,
      },
      unsupported: '',
      manualOnly,
      busy: () => null,
      log: noop,
      onChange: noop,
    });
    return { controller, calls };
  }

  it('says a newer version exists and never downloads or installs it', async () => {
    const { controller, calls } = build(true);
    const found = await controller.check();
    expect(found.state).toMatchObject({ phase: 'manual', info: { version: '1.3.0' } });
    expect(updateSnapshotSchema.safeParse(found).success).toBe(true);
    await controller.download();
    expect(() => {
      controller.install();
    }).toThrow();
    expect(calls).toEqual([]);
  });

  it('keeps the usual flow when the copy can update itself', async () => {
    const { controller } = build(false);
    expect((await controller.check()).state.phase).toBe('available');
  });

  it('links to a page the app is allowed to open', () => {
    expect(isAllowedExternalUrl(RELEASE_PAGE_URL)).toBe(true);
  });
});
