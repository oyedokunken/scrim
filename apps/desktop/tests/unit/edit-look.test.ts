import { describe, expect, it, vi } from 'vitest';
import { createExportHandlers, type ExportLike } from '../../src/main/export/export-handlers';
import { ExportService, type ExportServiceDeps } from '../../src/main/export/service';
import type { ExportOutcome, ExportRequest } from '../../src/main/export/types';
import { customBackgroundId } from '../../src/shared/backgrounds-contract';
import { exportContract } from '../../src/shared/export-contract';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { DEFAULT_SETTINGS, applyLook, lookSchema } from '../../src/shared/settings';

const ID = '3f9c2a1e-8d4b-4c7a-9e21-0b5d6a7c8e90';

describe('the look of one render', () => {
  it('carries only the cursor, zoom and background choices', () => {
    expect(
      lookSchema.safeParse({ cursorStyle: 'halo', zoomLevel: 2.2, backgroundId: 'dots' }).success,
    ).toBe(true);
    expect(lookSchema.safeParse({ cameraOn: true }).success).toBe(false);
    expect(lookSchema.safeParse({ destinationFolder: 'C:\\x' }).success).toBe(false);
    expect(lookSchema.safeParse({ zoomLevel: 9 }).success).toBe(false);
  });

  it('wins over the saved settings and leaves the rest alone', () => {
    const merged = applyLook(DEFAULT_SETTINGS, { cursorStyle: 'off', zoomLevel: 2.4 });
    expect(merged.cursorStyle).toBe('off');
    expect(merged.zoomLevel).toBe(2.4);
    expect(merged.backgroundId).toBe(DEFAULT_SETTINGS.backgroundId);
    expect(merged.shortcutRecord).toBe(DEFAULT_SETTINGS.shortcutRecord);
    expect(applyLook(DEFAULT_SETTINGS, undefined)).toBe(DEFAULT_SETTINGS);
    // A key set to undefined keeps the saved value.
    const keep = applyLook(DEFAULT_SETTINGS, { zoomOn: undefined });
    expect(keep.zoomOn).toBe(DEFAULT_SETTINGS.zoomOn);
  });
});

describe("the render style with the person's own image", () => {
  it('turns the image into a background picture at the path the export knows', () => {
    const style = renderStyleFromSettings(
      { ...DEFAULT_SETTINGS, backgroundId: customBackgroundId(ID) },
      (id) => (id === ID ? 'C:\\data\\backgrounds\\a.png' : undefined),
    );
    expect(style.background?.spec).toEqual({ kind: 'image', path: 'C:\\data\\backgrounds\\a.png' });
  });

  it('falls back to the default preset when the image was removed', () => {
    const style = renderStyleFromSettings(
      { ...DEFAULT_SETTINGS, backgroundId: customBackgroundId(ID) },
      () => undefined,
    );
    expect(style.background?.spec).toEqual({ kind: 'preset', id: 'deep-green' });
  });

  it('keeps presets and none as they were', () => {
    expect(
      renderStyleFromSettings({ ...DEFAULT_SETTINGS, backgroundId: 'dots' }).background?.spec,
    ).toEqual({
      kind: 'preset',
      id: 'dots',
    });
    expect(
      renderStyleFromSettings({ ...DEFAULT_SETTINGS, backgroundId: 'none' }).background?.spec,
    ).toEqual({
      kind: 'none',
    });
  });
});

function makeService(
  settings = DEFAULT_SETTINGS,
  backgroundPath?: ExportServiceDeps['backgroundPath'],
) {
  const requests: ExportRequest[] = [];
  const service = new ExportService({
    run: (request) => {
      requests.push(request);
      return Promise.resolve<ExportOutcome>({
        ok: true,
        path: 'a.mp4',
        durationMs: 1,
        bytes: 1,
        encoder: 'h264_mf',
        elapsedMs: 1,
        note: null,
        fellBack: false,
      });
    },
    settings: () => settings,
    ...(backgroundPath === undefined ? {} : { backgroundPath }),
    destination: () => 'D:/Videos/Scrim',
    previewDir: () => 'D:/cache/previews',
    newId: () => 'job1',
    log: () => undefined,
  });
  return { service, requests };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('rendering a recording with an edited look', () => {
  it('uses the look in the style and the cursor paint, and not the saved one', async () => {
    const { service, requests } = makeService();
    service.start({
      folder: 'D:/Projects/x.scrim',
      look: { cursorStyle: 'off', haloColor: 'black', zoomOn: false, backgroundId: 'dots' },
    });
    await settle();
    const request = requests[0];
    expect(request?.style.cursor?.style).toBe('off');
    expect(request?.style.zoom?.enabled).toBe(false);
    expect(request?.style.background?.spec).toEqual({ kind: 'preset', id: 'dots' });
    expect(request?.paint.haloRing).toEqual([0, 0, 0, 0.85]);
  });

  it("draws the person's own image from the path the store gives", async () => {
    const { service, requests } = makeService(DEFAULT_SETTINGS, (id) =>
      id === ID ? 'C:\\data\\backgrounds\\a.png' : undefined,
    );
    service.start({
      folder: 'D:/Projects/x.scrim',
      look: { backgroundId: customBackgroundId(ID) },
    });
    await settle();
    expect(requests[0]?.style.background?.spec).toEqual({
      kind: 'image',
      path: 'C:\\data\\backgrounds\\a.png',
    });
  });

  it('still uses the saved look when no look is given', async () => {
    const { service, requests } = makeService({ ...DEFAULT_SETTINGS, cursorStyle: 'ripples' });
    service.start({ folder: 'D:/Projects/x.scrim' });
    await settle();
    expect(requests[0]?.style.cursor?.style).toBe('ripples');
  });

  it('keeps the look on a retry with safer settings', async () => {
    const { service, requests } = makeService();
    service.start({ folder: 'D:/Projects/x.scrim', look: { zoomLevel: 2.4 } });
    await settle();
    service.retrySafer('job1');
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.style.zoom?.maxZoom).toBe(2.4);
  });

  it('passes the look from the export call to the engine', () => {
    const start = vi.fn(() => ({
      id: 'j',
      folder: 'D:/Projects/x.scrim',
      phase: 'queued' as const,
      progress: null,
      result: null,
      error: null,
      safer: false,
      preview: false,
    }));
    const exporter: ExportLike = {
      start,
      cancel: vi.fn(),
      retrySafer: vi.fn(),
      latest: vi.fn(),
      reveal: vi.fn(),
    };
    const handlers = createExportHandlers({ exporter, isKnownFolder: () => true });
    void handlers['export:start']({ folder: 'D:/Projects/x.scrim', look: { zoomLevel: 2 } });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ look: { zoomLevel: 2 } }));
  });

  it('accepts a look in the export call and refuses anything else in it', () => {
    const input = exportContract['export:start'].input;
    expect(input.safeParse({ folder: 'D:\\x', look: { cursorStyle: 'halo' } }).success).toBe(true);
    expect(input.safeParse({ folder: 'D:\\x', look: { keepSound: false } }).success).toBe(false);
  });
});
