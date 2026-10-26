import { describe, expect, it } from 'vitest';
import { CHANNELS, EVENT_CHANNELS, type Channel } from '../../src/shared/channels';
import { contract, events } from '../../src/shared/ipc-contract';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

describe('the contract and the channel list', () => {
  it('declare exactly the same channels', () => {
    expect(Object.keys(contract).sort()).toEqual([...CHANNELS].sort());
    expect(Object.keys(events).sort()).toEqual([...EVENT_CHANNELS].sort());
  });

  it('has no duplicate channel names', () => {
    expect(new Set(CHANNELS).size).toBe(CHANNELS.length);
  });
});

const accepts = (channel: Channel, value: unknown) =>
  contract[channel].input.safeParse(value).success;

describe('every channel rejects input that does not fit', () => {
  it.each([
    ['settings:get', { extra: 1 }],
    ['settings:get', 'x'],
    ['settings:set', undefined],
    ['settings:set', null],
    ['settings:set', 'x'],
    ['settings:set', { zoomLevel: 5 }],
    ['settings:set', { zoomLevel: '2' }],
    ['settings:set', { unknownSetting: true }],
    ['settings:set', { cursorStyle: 'sparkles' }],
    ['settings:set', { frameRate: 45 }],
    ['settings:set', { destinationFolder: '' }],
    ['folder:choose', {}],
    ['shell:open-external', undefined],
    ['shell:open-external', {}],
    ['shell:open-external', { url: 'https://example.com/' }],
    ['shell:open-external', { url: 'file:///C:/Windows/win.ini' }],
    ['shell:open-external', { url: 'https://github.com:8443/oyedokunken/scrim' }],
    ['shell:open-external', { url: 'https://github.com/oyedokunken/scrim', extra: 1 }],
    ['shell:show-in-folder', {}],
    ['shell:show-in-folder', { path: '' }],
    ['shell:show-in-folder', { path: 5 }],
    ['shell:show-in-folder', { path: 'a', extra: 1 }],
    ['logs:open-folder', 1],
  ] as const)('%s rejects %j', (channel, value) => {
    expect(accepts(channel, value)).toBe(false);
  });
});

describe('every channel accepts input that fits', () => {
  it.each([
    ['settings:get', undefined],
    ['settings:set', {}],
    ['settings:set', { zoomLevel: 2.5, cameraOn: true }],
    ['settings:set', { destinationFolder: null }],
    ['folder:choose', undefined],
    ['shell:open-external', { url: 'https://github.com/oyedokunken/scrim/releases' }],
    ['shell:show-in-folder', { path: 'C:\\Recordings\\one' }],
    ['logs:open-folder', undefined],
  ] as const)('%s accepts %j', (channel, value) => {
    expect(accepts(channel, value)).toBe(true);
  });
});

describe('outputs', () => {
  it('settings:get returns a full, valid settings object', () => {
    expect(contract['settings:get'].output.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('refuses a settings object with a missing or extra field', () => {
    const missing: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS };
    delete missing.zoomLevel;
    expect(contract['settings:get'].output.safeParse(missing).success).toBe(false);
    expect(contract['settings:get'].output.safeParse({ ...DEFAULT_SETTINGS, x: 1 }).success).toBe(
      false,
    );
  });

  it('folder:choose returns a path or null, nothing else', () => {
    expect(contract['folder:choose'].output.safeParse(null).success).toBe(true);
    expect(contract['folder:choose'].output.safeParse('C:\\x').success).toBe(true);
    expect(contract['folder:choose'].output.safeParse(5).success).toBe(false);
  });
});
