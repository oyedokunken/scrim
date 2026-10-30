import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import config from '../../electron-builder.config';
import { createUpdateHandlers } from '../../src/main/updates/update-handlers';
import type { UpdateController } from '../../src/main/updates/update-controller';
import { CHANNELS, EVENT_CHANNELS } from '../../src/shared/channels';
import { contract, events } from '../../src/shared/ipc-contract';
import { DEFAULT_SETTINGS, settingsPatchSchema, settingsSchema } from '../../src/shared/settings';
import { updateSnapshotSchema } from '../../src/shared/updates-contract';

const root = join(__dirname, '../../../..');

describe('the update channels', () => {
  it('are in the contract and the name list, and the event carries a snapshot', () => {
    for (const channel of [
      'updates:state',
      'updates:check',
      'updates:download',
      'updates:install',
      'app:activity',
    ] as const) {
      expect(CHANNELS).toContain(channel);
      expect(contract[channel]).toBeDefined();
    }
    expect(EVENT_CHANNELS).toContain('updates:changed');
    expect(events['updates:changed']).toBe(updateSnapshotSchema);
  });

  it('refuse stray input', () => {
    expect(contract['app:activity'].input.safeParse({ editing: true, more: 1 }).success).toBe(
      false,
    );
    expect(contract['app:activity'].input.safeParse({ editing: 'yes' }).success).toBe(false);
    expect(contract['updates:check'].input.safeParse({ force: true }).success).toBe(false);
  });

  it('hand each call to the controller', async () => {
    const snapshot = { state: { phase: 'idle' as const }, blocked: null };
    const controller: UpdateController = {
      snapshot: vi.fn(() => snapshot),
      check: vi.fn(() => Promise.resolve(snapshot)),
      download: vi.fn(() => Promise.resolve(snapshot)),
      install: vi.fn(),
      setEditing: vi.fn(),
    };
    const handlers = createUpdateHandlers(controller);
    expect(await handlers['updates:state']()).toEqual(snapshot);
    await handlers['updates:check']();
    await handlers['updates:download']();
    await handlers['updates:install']();
    await handlers['app:activity']({ editing: true });
    expect(controller.check).toHaveBeenCalledOnce();
    expect(controller.download).toHaveBeenCalledOnce();
    expect(controller.install).toHaveBeenCalledOnce();
    expect(controller.setEditing).toHaveBeenCalledWith(true);
  });
});

describe('the startup check setting', () => {
  it('is off by default and can be changed from the page', () => {
    expect(DEFAULT_SETTINGS.autoCheckUpdates).toBe(false);
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ autoCheckUpdates: true }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ autoCheckUpdates: 'on' }).success).toBe(false);
  });
});

describe('publishing what the updater reads', () => {
  it('points the installed app at the GitHub releases of this repository', () => {
    expect(config.publish).toEqual([
      { provider: 'github', owner: 'oyedokunken', repo: 'scrim', releaseType: 'release' },
    ]);
  });

  it('builds a zip on macOS, because the Mac updater installs from the zip and not the dmg', () => {
    expect(config.mac?.target).toEqual(['dmg', 'zip']);
  });

  it('names the Windows installer with dashes, as the update file lists it', () => {
    expect(config.nsis?.artifactName).toBe('${productName}-Setup-${version}.${ext}');
  });

  const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');

  it('uploads the update files and the blockmaps with every installer', () => {
    expect(workflow).toContain('apps/desktop/release/latest*.yml');
    expect(workflow).toContain('apps/desktop/release/*.blockmap');
  });

  it('merges the two Mac update files, which would otherwise overwrite each other', () => {
    expect(workflow).toContain('merge-mac-update-info');
  });

  it('publishes the update files with the release', () => {
    expect(workflow).toMatch(/gh release create[^\n]*dist\/\*/);
    expect(workflow).toContain('latest-mac.yml');
  });
});
