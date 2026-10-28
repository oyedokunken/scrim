import { describe, expect, it } from 'vitest';
import {
  contains,
  dragRect,
  MIN_REGION_PX,
  moveRect,
  sizeLabel,
  toEvenPixels,
} from '../../src/recorder/region/geometry';

const display = { width: 1280, height: 720 };

describe('dragRect', () => {
  it('is the box between the start and the pointer, whichever way it is dragged', () => {
    const expected = { x: 100, y: 100, width: 200, height: 150 };
    expect(dragRect({ x: 100, y: 100 }, { x: 300, y: 250 }, display)).toEqual(expected);
    expect(dragRect({ x: 300, y: 250 }, { x: 100, y: 100 }, display)).toEqual(expected);
  });

  it('stops at the edges of the display', () => {
    expect(dragRect({ x: 1200, y: 650 }, { x: 5000, y: -40 }, display)).toEqual({
      x: 1200,
      y: 0,
      width: 80,
      height: 650,
    });
  });
});

describe('moveRect', () => {
  const box = { x: 100, y: 100, width: 300, height: 200 };

  it('moves the box and keeps its size', () => {
    expect(moveRect(box, 50, -20, display)).toEqual({ x: 150, y: 80, width: 300, height: 200 });
  });

  it('holds the whole box inside the display', () => {
    expect(moveRect(box, 5000, 5000, display)).toEqual({ x: 980, y: 520, width: 300, height: 200 });
    expect(moveRect(box, -5000, -5000, display)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});

describe('contains', () => {
  it('is true inside and on the edge, false outside', () => {
    const box = { x: 10, y: 10, width: 100, height: 50 };
    expect(contains(box, { x: 10, y: 10 })).toBe(true);
    expect(contains(box, { x: 110, y: 60 })).toBe(true);
    expect(contains(box, { x: 111, y: 30 })).toBe(false);
  });
});

describe('toEvenPixels', () => {
  it('gives whole even pixels at 100 percent', () => {
    const result = toEvenPixels({ x: 10, y: 20, width: 401, height: 301 }, 1, display);
    expect(result?.px).toEqual({ x: 10, y: 20, width: 400, height: 300 });
    expect(result?.dip).toEqual({ x: 10, y: 20, width: 400, height: 300 });
  });

  it('works in physical pixels on a scaled display and hands back the matching box', () => {
    const result = toEvenPixels({ x: 100.4, y: 50.6, width: 640.2, height: 360.1 }, 1.5, display);
    // Left 150.6 rounds to 151. Right (100.4 + 640.2) * 1.5 = 1110.9 rounds to 1111. Width 960.
    expect(result?.px).toEqual({ x: 151, y: 76, width: 960, height: 540 });
    expect(result?.dip.width).toBeCloseTo(640, 9);
    expect(Math.round((result?.dip.x ?? 0) * 1.5)).toBe(151);
  });

  it('refuses a box smaller than the minimum on either side', () => {
    const small = { x: 0, y: 0, width: MIN_REGION_PX - 1, height: 500 };
    expect(toEvenPixels(small, 1, display)).toBeUndefined();
    expect(toEvenPixels({ x: 0, y: 0, width: 500, height: 10 }, 1, display)).toBeUndefined();
    const smallest = { x: 0, y: 0, width: MIN_REGION_PX, height: MIN_REGION_PX };
    expect(toEvenPixels(smallest, 1, display)).toBeDefined();
  });

  it('never leaves the display, even when the box is dragged right to the edge', () => {
    const odd = toEvenPixels({ x: 1000, y: 600, width: 281, height: 121 }, 1, {
      width: 1281,
      height: 721,
    });
    expect((odd?.px.x ?? 0) + (odd?.px.width ?? 0)).toBeLessThanOrEqual(1281);
    expect(odd?.px.width).toBe(280);
  });

  it('always gives even sizes inside the display, whatever the box and the scale', () => {
    const screen = { width: 1920, height: 1080 };
    // A fixed sweep of awkward values: odd sizes, fractions, edges, and every common scale.
    const starts = [0, 1, 7, 333.3, 959.9, 1000, 1899.5];
    const sizes = [1, 63, 64, 65, 99.5, 640, 1001, 1919, 2500];
    for (const scale of [1, 1.25, 1.5, 1.75, 2, 3]) {
      for (const x of starts) {
        for (const y of starts.map((value) => value / 2)) {
          for (const width of sizes) {
            for (const height of sizes) {
              const result = toEvenPixels({ x, y, width, height }, scale, screen);
              if (result === undefined) continue;
              expect(result.px.width % 2).toBe(0);
              expect(result.px.height % 2).toBe(0);
              expect(result.px.width).toBeGreaterThanOrEqual(MIN_REGION_PX);
              expect(result.px.height).toBeGreaterThanOrEqual(MIN_REGION_PX);
              expect(result.px.x).toBeGreaterThanOrEqual(0);
              expect(result.px.y).toBeGreaterThanOrEqual(0);
              expect(result.px.x + result.px.width).toBeLessThanOrEqual(Math.round(1920 * scale));
              expect(result.px.y + result.px.height).toBeLessThanOrEqual(Math.round(1080 * scale));
              // The session cuts this with each edge rounded on its own and must get the same pixels.
              const left = Math.round(result.dip.x * scale);
              const right = Math.round((result.dip.x + result.dip.width) * scale);
              expect(left).toBe(result.px.x);
              expect(right - left).toBe(result.px.width);
            }
          }
        }
      }
    }
  });
});

describe('sizeLabel', () => {
  it('shows width and height in physical pixels', () => {
    expect(sizeLabel({ width: 1280, height: 720 })).toBe('1280 x 720');
  });
});
