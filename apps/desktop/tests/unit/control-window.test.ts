import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  screen: {},
  app: { getAppPath: () => '/app' },
  BrowserWindow: vi.fn(),
}));
const { CONTROL_WINDOW, controlPosition } = await import('../../src/main/windows/control-window');

describe('controlPosition', () => {
  it('centers the control at the top of the display, a little below its edge', () => {
    const position = controlPosition({ x: 0, y: 0, width: 1920 });
    expect(position).toEqual({ x: (1920 - CONTROL_WINDOW.width) / 2, y: 12 });
  });

  it('follows a display that is not at the origin, including a negative one', () => {
    expect(controlPosition({ x: 1920, y: 40, width: 1280 })).toEqual({
      x: 1920 + (1280 - CONTROL_WINDOW.width) / 2,
      y: 52,
    });
    expect(controlPosition({ x: -1600, y: 0, width: 1600 })).toEqual({
      x: -1600 + Math.round((1600 - CONTROL_WINDOW.width) / 2),
      y: 12,
    });
  });

  it('gives whole pixels', () => {
    const { x, y } = controlPosition({ x: 0, y: 0, width: 1367 });
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });

  it('is small enough to stay out of the way', () => {
    expect(CONTROL_WINDOW.width).toBeLessThanOrEqual(360);
    expect(CONTROL_WINDOW.height).toBeLessThanOrEqual(80);
  });
});
