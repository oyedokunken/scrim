import { describe, it } from 'vitest';
import { computeLayout } from '@scrim/core/render';
import { Compositor } from '../../src/main/export/compositor';
import { buildBase } from '../../src/main/export/raster';
import { cursorPaintFor } from '../../src/main/export/look';

describe.skipIf(process.env['SCRIM_BENCH'] === undefined)('compositor speed', () => {
  it('measures', () => {
    const source = { width: 1920, height: 1080 };
    const layout = computeLayout(source, source, {
      spec: { kind: 'preset', id: 'dots' },
      paddingShare: 0.06,
      radiusShare: 0.025,
    });
    const t0 = performance.now();
    const base = buildBase(layout);
    console.log('base ms', performance.now() - t0);
    const comp = new Compositor(layout, source, base, cursorPaintFor('brand'));
    const screen = new Uint8Array(1920 * 1080 * 4).fill(120);
    const camera = new Uint8Array(300 * 300 * 4).fill(90);
    const out = new Uint8Array(1920 * 1080 * 4);
    const input = {
      screen,
      camera,
      cameraSize: 300,
      view: { x: 100.3, y: 50.7, width: 1920 / 1.8, height: 1080 / 1.8 },
      cursor: { halo: { x: 500, y: 400, radius: 26 }, ripples: [] },
      bubble: { x: 100, y: 700, side: 250, radius: 125 },
    };
    for (let i = 0; i < 5; i += 1) comp.render(input, out);
    const t1 = performance.now();
    for (let i = 0; i < 30; i += 1) comp.render(input, out);
    console.log('ms per frame', (performance.now() - t1) / 30);
  }, 120_000);
});
