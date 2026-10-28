import { describe, expect, it } from 'vitest';
import { cropInPixels } from '../../src/main/recording/crop';

describe('cropInPixels', () => {
  it('rounds each edge on its own, on the primary display', () => {
    expect(
      cropInPixels({ x: 100.4, y: 50.6, width: 640.2, height: 360.1 }, { x: 0, y: 0 }, 1.5),
    ).toEqual({ x: 151, y: 76, width: 960, height: 540 });
  });

  it('is relative to the display, so a second display to the right starts at its own left edge', () => {
    // The display sits at x 1280 and 100 above the desktop origin, at 125 percent.
    const crop = { x: 1280 + 80, y: -100 + 40, width: 400, height: 200 };
    expect(cropInPixels(crop, { x: 1280, y: -100 }, 1.25)).toEqual({
      x: 100,
      y: 50,
      width: 500,
      height: 250,
    });
  });

  it('handles a display to the left of the primary, which has negative coordinates', () => {
    expect(
      cropInPixels({ x: -1920 + 10, y: 20, width: 100, height: 100 }, { x: -1920, y: 0 }, 1),
    ).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('never gives an empty box', () => {
    expect(cropInPixels({ x: 0, y: 0, width: 0.1, height: 0.1 }, { x: 0, y: 0 }, 1)).toMatchObject({
      width: 1,
      height: 1,
    });
  });
});
