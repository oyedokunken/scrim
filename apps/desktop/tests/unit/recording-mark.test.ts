import { describe, expect, it, vi } from 'vitest';
import {
  createRecordingMark,
  redDotBitmap,
  type MarkableWindow,
} from '../../src/main/shell/recording-mark';

function fakeWindow(overrides: Partial<MarkableWindow> = {}) {
  const calls: string[] = [];
  const window: MarkableWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    minimize: () => calls.push('minimize'),
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    setContentProtection: (on) => calls.push(`protect:${String(on)}`),
    setOverlayIcon: (icon) => calls.push(icon === null ? 'overlay:off' : 'overlay:on'),
    ...overrides,
  };
  return { window, calls };
}

describe('redDotBitmap', () => {
  const size = 16;
  const bitmap = redDotBitmap(size);
  const pixel = (x: number, y: number) =>
    bitmap.subarray((y * size + x) * 4, (y * size + x) * 4 + 4);

  it('is a square of four bytes a pixel', () => {
    expect(bitmap.length).toBe(size * size * 4);
  });

  it('is record red in the middle, as BGRA, and fully opaque', () => {
    expect([...pixel(8, 8)]).toEqual([0x30, 0x3b, 0xff, 255]);
  });

  it('is clear in the corners, so the dot is round', () => {
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(15, 15)[3]).toBe(0);
  });
});

describe('createRecordingMark', () => {
  const mark = createRecordingMark({ makeDot: () => ({}) });

  it('excludes the window from capture, adds the dot, then minimizes instead of hiding', () => {
    const { window, calls } = fakeWindow();
    mark.begin(window);
    expect(calls).toEqual(['protect:true', 'overlay:on', 'minimize']);
  });

  it('undoes all of it at the end and brings the window back', () => {
    const { window, calls } = fakeWindow();
    mark.end(window);
    expect(calls).toEqual(['overlay:off', 'protect:false', 'restore', 'show', 'focus']);
  });

  it('does not restore a window that is already up', () => {
    const { window, calls } = fakeWindow({ isMinimized: () => false });
    mark.end(window);
    expect(calls).not.toContain('restore');
  });

  it('does nothing without a window or with a destroyed one', () => {
    const setContentProtection = vi.fn();
    mark.begin(null);
    mark.end(null);
    const { window } = fakeWindow({ isDestroyed: () => true, setContentProtection });
    mark.begin(window);
    mark.end(window);
    expect(setContentProtection).not.toHaveBeenCalled();
  });
});
