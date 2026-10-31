import { computeLayout, layoutText, type TextItem } from '@scrim/core/render';
import { describe, expect, it } from 'vitest';
import { Compositor } from '../../src/main/export/compositor';
import { cursorPaintFor } from '../../src/main/export/look';
import { buildBase } from '../../src/main/export/raster';
import { rasterizeText, textWidth } from '../../src/main/export/text-raster';

const output = { width: 640, height: 360 };
const source = output;
const layout = computeLayout(source, output, { spec: { kind: 'none' } });
const paint = cursorPaintFor('brand');

const item = (over: Partial<TextItem> = {}): TextItem => ({
  id: 't',
  text: 'Hello Scrim',
  startMs: 0,
  endMs: 1000,
  x: 0.5,
  y: 0.5,
  size: 'large',
  color: 'white',
  chip: false,
  ...over,
});

function render(texts: readonly TextItem[]): Uint8Array {
  const screen = new Uint8Array(source.width * source.height * 4);
  for (let i = 0; i < source.width * source.height; i += 1) screen.set([40, 40, 40, 255], i * 4);
  const out = new Uint8Array(screen.length);
  new Compositor(layout, source, buildBase(layout), paint).render(
    {
      screen,
      camera: null,
      cameraSize: 0,
      view: { x: 0, y: 0, width: source.width, height: source.height },
      cursor: { halo: null, ripples: [] },
      bubble: null,
      texts,
    },
    out,
  );
  return out;
}

/** Counts pixels that differ from the text free frame inside and outside a rectangle. */
function changes(
  plain: Uint8Array,
  drawn: Uint8Array,
  box: { x: number; y: number; width: number; height: number },
) {
  let inside = 0;
  let outside = 0;
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const o = (y * output.width + x) * 4;
      const same =
        plain[o] === drawn[o] && plain[o + 1] === drawn[o + 1] && plain[o + 2] === drawn[o + 2];
      if (same) continue;
      const within =
        x >= box.x - 1 &&
        x <= box.x + box.width + 1 &&
        y >= box.y - 1 &&
        y <= box.y + box.height + 1;
      if (within) inside += 1;
      else outside += 1;
    }
  }
  return { inside, outside };
}

describe('text in the export', () => {
  const plain = render([]);

  it('paints letters inside the text box and nowhere else', () => {
    const t = item();
    const drawn = render([t]);
    const placed = layoutText(t, (px) => textWidth(t.text, px), output);
    const { inside, outside } = changes(plain, drawn, placed.box);
    expect(inside).toBeGreaterThan(200);
    expect(outside).toBe(0);
  });

  it('paints white letters light against the grey picture', () => {
    const t = item();
    const drawn = render([t]);
    let bright = 0;
    for (let i = 0; i < drawn.length; i += 4) if ((drawn[i] ?? 0) > 240) bright += 1;
    expect(bright).toBeGreaterThan(100);
  });

  it('fills the chip behind the text when asked', () => {
    const t = item({ chip: true, color: 'butter' });
    const drawn = render([t]);
    const placed = layoutText(t, (px) => textWidth(t.text, px), output);
    const probeX = Math.round(placed.box.x + 3);
    const probeY = Math.round(placed.box.y + placed.box.height / 2);
    const o = (probeY * output.width + probeX) * 4;
    // The green chip (#004E52) at 85 percent over grey: red nearly gone, blue lifted.
    expect(drawn[o + 2]).toBeLessThan(15);
    expect(drawn[o]).toBeGreaterThan(65);
    const { outside } = changes(plain, drawn, placed.box);
    expect(outside).toBe(0);
  });

  it('keeps text near an edge inside the frame', () => {
    const t = item({ x: 0, y: 1, text: 'Corner' });
    const placed = layoutText(t, (px) => textWidth(t.text, px), output);
    expect(placed.box.x).toBeGreaterThanOrEqual(0);
    expect(placed.box.y + placed.box.height).toBeLessThanOrEqual(output.height);
    const { outside } = changes(plain, render([t]), placed.box);
    expect(outside).toBe(0);
  });

  it('draws nothing for no text, and a stable picture each time', () => {
    expect(Buffer.from(render([])).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(render([item()])).equals(Buffer.from(render([item()])))).toBe(true);
  });
});

describe('the text rasterizer', () => {
  it('measures wider text as wider and larger text as larger', () => {
    expect(textWidth('Hello', 40)).toBeGreaterThan(textWidth('Hi', 40));
    expect(textWidth('Hello', 80)).toBeCloseTo(textWidth('Hello', 40) * 2, 5);
  });

  it('puts ink on the glyphs and none in a space', () => {
    const ink = (mask: ReturnType<typeof rasterizeText>) =>
      mask.alpha.reduce((sum, value) => sum + value, 0);
    expect(ink(rasterizeText('O', 60))).toBeGreaterThan(5000);
    expect(ink(rasterizeText('   ', 60))).toBe(0);
  });

  it('draws characters it has no outline for as a question mark', () => {
    const odd = rasterizeText('中', 60);
    const mark = rasterizeText('?', 60);
    expect(odd.alpha).toEqual(mark.alpha);
  });

  it('leaves a hole in the middle of an O', () => {
    const mask = rasterizeText('O', 100);
    const mid = mask.baselineY - 35;
    const center = mask.alpha[mid * mask.width + Math.round(mask.width / 2)] ?? 255;
    expect(center).toBe(0);
  });
});
