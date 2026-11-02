import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layoutText, TEXT_COLORS, TEXT_SIZES, type TextItem } from '../src';

const item = (over: Partial<TextItem> = {}): TextItem => ({
  id: 'a',
  text: 'Hello',
  startMs: 0,
  endMs: 1000,
  x: 0.5,
  y: 0.5,
  size: 'medium',
  color: 'white',
  chip: true,
  ...over,
});

const measure = (chars: number) => (px: number) => chars * px * 0.5;

describe('layoutText', () => {
  it('centers the box on the position and scales the letters with the frame height', () => {
    const layout = layoutText(item(), measure(10), { width: 1920, height: 1080 });
    expect(layout.fontPx).toBeCloseTo(0.065 * 1080);
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(960);
    expect(layout.box.y + layout.box.height / 2).toBeCloseTo(540);
  });

  it('shrinks text that is wider than the frame', () => {
    const layout = layoutText(item(), measure(400), { width: 800, height: 450 });
    expect(layout.box.width).toBeLessThanOrEqual(800 * 0.96 + 1e-6);
  });

  it('keeps the box inside the frame for any position, size and length', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(...TEXT_SIZES),
        fc.constantFrom(...TEXT_COLORS),
        fc.integer({ min: 1, max: 120 }),
        fc.integer({ min: 120, max: 3840 }),
        fc.integer({ min: 120, max: 2160 }),
        (x, y, size, color, chars, width, height) => {
          const layout = layoutText(item({ x, y, size, color }), measure(chars), { width, height });
          const { box } = layout;
          expect(box.x).toBeGreaterThanOrEqual(-1e-6);
          expect(box.y).toBeGreaterThanOrEqual(-1e-6);
          expect(box.x + box.width).toBeLessThanOrEqual(width + 1e-6);
          expect(box.y + box.height).toBeLessThanOrEqual(height + 1e-6);
          expect(layout.textX).toBeGreaterThanOrEqual(box.x);
        },
      ),
    );
  });
});
