import { describe, expect, it, vi } from 'vitest';
import {
  buildAreaRequest,
  createAreaHandlers,
  devicesFromSettings,
  styleFromSettings,
  toBridgeAreaOutcome,
} from '../../src/main/ipc/area-handlers';
import type { AreaOutcome, AreaRequest } from '../../src/main/recording/area-flow';
import { areaOutcomeSchema, areaRequestSchema } from '../../src/shared/recording-contract';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const off = { enabled: false };

describe('styleFromSettings', () => {
  it('carries the cursor style and the zoom choices into the look', () => {
    const style = styleFromSettings({ ...DEFAULT_SETTINGS, cursorStyle: 'halo', zoomLevel: 2.4 });
    expect(style.cursor?.style).toBe('halo');
    expect(style.zoom).toMatchObject({ enabled: true, maxZoom: 2.4, holdMs: 1200 });
    expect(style.zoom?.easeMs).toBeGreaterThanOrEqual(200);
    expect(style.zoom?.easeMs).toBeLessThanOrEqual(900);
  });
});

describe('devicesFromSettings', () => {
  it('uses the saved switches and leaves the device out when none was picked', () => {
    expect(devicesFromSettings(DEFAULT_SETTINGS)).toEqual({ camera: off, mic: off });
    expect(
      devicesFromSettings({ ...DEFAULT_SETTINGS, micOn: true, micDeviceId: 'mic-1' }).mic,
    ).toEqual({ enabled: true, deviceId: 'mic-1' });
  });
});

describe('buildAreaRequest', () => {
  const input = { mode: 'record' as const, camera: off, mic: off };

  it('records into the chosen folder with the saved look', () => {
    const request = buildAreaRequest(
      input,
      { ...DEFAULT_SETTINGS, destinationFolder: 'TAKES' },
      'PICTURES',
    );
    expect(request).toMatchObject({ mode: 'record', destination: 'TAKES' });
    expect(request.style?.zoom?.enabled).toBe(true);
    expect(request.folder).toBeUndefined();
  });

  it('counts down 3, 2, 1 unless the countdown is switched off', () => {
    expect(buildAreaRequest(input, DEFAULT_SETTINGS, 'PICTURES').countdownSeconds).toBe(3);
    expect(
      buildAreaRequest(input, { ...DEFAULT_SETTINGS, countdownOn: false }, 'PICTURES')
        .countdownSeconds,
    ).toBe(0);
  });

  it('takes screenshots into the pictures folder and copies them', () => {
    const request = buildAreaRequest(
      { ...input, mode: 'screenshot' },
      DEFAULT_SETTINGS,
      'PICTURES',
    );
    expect(request).toMatchObject({
      mode: 'screenshot',
      folder: 'PICTURES',
      copyToClipboard: true,
    });
    expect(request.destination).toBeUndefined();
  });
});

describe('toBridgeAreaOutcome', () => {
  const error = { code: 'disk-full', message: 'm', nextStep: 'n', detail: 'SECRET_PATH' };

  it('drops the session folder of a started recording', () => {
    const out = toBridgeAreaOutcome({ ok: true, mode: 'record', folder: 'SESSION' });
    expect(out).toEqual({ ok: true, mode: 'record' });
    expect(areaOutcomeSchema.safeParse(out).success).toBe(true);
  });

  it('passes on why a screenshot could not be saved, without the technical detail', () => {
    const out = toBridgeAreaOutcome({
      ok: true,
      mode: 'screenshot',
      result: {
        copied: true,
        width: 10,
        height: 5,
        saveError: {
          code: 'folder-not-writable',
          message: 'Windows blocked it.',
          nextStep: 'Allow Scrim.',
          detail: 'EPERM C:/secret',
        },
      },
    });
    expect(out).toMatchObject({
      result: {
        copied: true,
        saveError: { message: 'Windows blocked it.', nextStep: 'Allow Scrim.' },
      },
    });
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(areaOutcomeSchema.safeParse(out).success).toBe(true);
  });

  it('keeps the size and path of a screenshot', () => {
    const out = toBridgeAreaOutcome({
      ok: true,
      mode: 'screenshot',
      result: { path: 'PICTURES/a.png', copied: true, width: 10, height: 8 },
    });
    expect(areaOutcomeSchema.parse(out)).toEqual(out);
  });

  it('passes cancelled through and strips the detail from a rejection', () => {
    expect(toBridgeAreaOutcome({ ok: false, reason: 'cancelled' })).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    const rejected = toBridgeAreaOutcome({
      ok: false,
      reason: 'rejected',
      error,
    } as unknown as AreaOutcome);
    expect(JSON.stringify(rejected)).not.toContain('SECRET_PATH');
    expect(areaOutcomeSchema.safeParse(rejected).success).toBe(true);
  });
});

describe('the area contract', () => {
  it('refuses a folder, a style or any stray key from the page', () => {
    const base = { mode: 'record', camera: off, mic: off };
    expect(areaRequestSchema.safeParse(base).success).toBe(true);
    for (const extra of [{ folder: 'SESSION' }, { destination: 'SESSION' }, { style: {} }]) {
      expect(areaRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
    expect(areaRequestSchema.safeParse({ ...base, mode: 'other' }).success).toBe(false);
  });
});

describe('createAreaHandlers', () => {
  it('runs the area with main-side settings and answers in the bridge shape', async () => {
    const run = vi.fn<(request: AreaRequest) => Promise<AreaOutcome>>(() =>
      Promise.resolve<AreaOutcome>({ ok: true, mode: 'record', folder: 'SESSION' }),
    );
    const handlers = createAreaHandlers({
      area: { run, cancel: vi.fn() },
      settings: () => ({ ...DEFAULT_SETTINGS, destinationFolder: 'TAKES' }),
      screenshotFolder: () => 'PICTURES',
    });
    const out = await handlers['area:run']({ mode: 'record', camera: off, mic: off });
    expect(out).toEqual({ ok: true, mode: 'record' });
    expect(run.mock.calls[0]?.[0]).toMatchObject({ destination: 'TAKES' });
  });

  it('cancels the picker', async () => {
    const cancel = vi.fn();
    const handlers = createAreaHandlers({
      area: { run: vi.fn(), cancel },
      settings: () => DEFAULT_SETTINGS,
      screenshotFolder: () => 'P',
    });
    await handlers['area:cancel'](undefined);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
