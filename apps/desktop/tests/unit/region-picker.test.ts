import { describe, expect, it } from 'vitest';
import { RegionPicker } from '../../src/recorder/region/picker';

const display = { width: 1280, height: 720 };

function drawn(scale = 1) {
  const picker = new RegionPicker(display, scale);
  picker.pointerDown({ x: 100, y: 100 });
  picker.pointerMove({ x: 500, y: 400 });
  picker.pointerUp({ x: 500, y: 400 });
  return picker;
}

describe('RegionPicker', () => {
  it('draws a box by dragging on an empty part of the display, and reports that it began', () => {
    const picker = new RegionPicker(display, 1);
    expect(picker.pointerDown({ x: 100, y: 100 })).toEqual({ type: 'begin' });
    expect(picker.isDragging).toBe(true);
    picker.pointerMove({ x: 500, y: 400 });
    expect(picker.box).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    picker.pointerUp({ x: 500, y: 400 });
    expect(picker.isDragging).toBe(false);
    expect(picker.box).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  });

  it('moves the box when the drag starts inside it, without reporting a new box', () => {
    const picker = drawn();
    expect(picker.pointerDown({ x: 200, y: 200 })).toBeUndefined();
    picker.pointerMove({ x: 250, y: 230 });
    expect(picker.box).toEqual({ x: 150, y: 130, width: 400, height: 300 });
    picker.pointerMove({ x: 5000, y: 5000 });
    picker.pointerUp({ x: 5000, y: 5000 });
    expect(picker.box).toEqual({ x: 880, y: 420, width: 400, height: 300 });
  });

  it('starts a fresh box when the drag starts outside the old one', () => {
    const picker = drawn();
    expect(picker.pointerDown({ x: 900, y: 600 })).toEqual({ type: 'begin' });
    expect(picker.box).toBeUndefined();
    picker.pointerMove({ x: 1000, y: 700 });
    expect(picker.box).toEqual({ x: 900, y: 600, width: 100, height: 100 });
  });

  it('throws away a click that never became a box', () => {
    const picker = new RegionPicker(display, 1);
    picker.pointerDown({ x: 300, y: 300 });
    picker.pointerUp({ x: 301, y: 302 });
    expect(picker.box).toBeUndefined();
  });

  it('shows the whole even pixels the box will record', () => {
    const picker = new RegionPicker(display, 1.5);
    picker.pointerDown({ x: 100, y: 100 });
    picker.pointerMove({ x: 500.4, y: 400.2 });
    picker.pointerUp({ x: 500.4, y: 400.2 });
    const px = picker.pixels?.px;
    expect((px?.width ?? 1) % 2).toBe(0);
    expect((px?.height ?? 1) % 2).toBe(0);
  });

  it('confirms with Enter, in even device independent pixels, only for a box that is big enough', () => {
    const picker = drawn();
    expect(picker.key('Enter')).toEqual({
      type: 'confirm',
      rect: { x: 100, y: 100, width: 400, height: 300 },
    });
    const small = new RegionPicker(display, 1);
    small.pointerDown({ x: 10, y: 10 });
    small.pointerMove({ x: 40, y: 40 });
    small.pointerUp({ x: 40, y: 40 });
    expect(small.key('Enter')).toBeUndefined();
    expect(new RegionPicker(display, 1).key('Enter')).toBeUndefined();
  });

  it('cancels with Escape whatever the state, and ignores other keys', () => {
    expect(new RegionPicker(display, 1).key('Escape')).toEqual({ type: 'cancel' });
    expect(drawn().key('Escape')).toEqual({ type: 'cancel' });
    expect(drawn().key('a')).toBeUndefined();
    expect(drawn().key(' ')).toBeUndefined();
  });

  it('drops the box and any drag when told to clear', () => {
    const picker = drawn();
    picker.pointerDown({ x: 900, y: 600 });
    picker.clear();
    expect(picker.box).toBeUndefined();
    expect(picker.isDragging).toBe(false);
    picker.pointerMove({ x: 1000, y: 700 });
    expect(picker.box).toBeUndefined();
  });

  describe('resizing from the handles', () => {
    it('finds the handle under a point, corners before edges', () => {
      const picker = drawn();
      expect(picker.handleAt({ x: 100, y: 100 })).toBe('nw');
      expect(picker.handleAt({ x: 500, y: 100 })).toBe('ne');
      expect(picker.handleAt({ x: 100, y: 400 })).toBe('sw');
      expect(picker.handleAt({ x: 500, y: 400 })).toBe('se');
      expect(picker.handleAt({ x: 300, y: 98 })).toBe('n');
      expect(picker.handleAt({ x: 300, y: 402 })).toBe('s');
      expect(picker.handleAt({ x: 98, y: 250 })).toBe('w');
      expect(picker.handleAt({ x: 502, y: 250 })).toBe('e');
      expect(picker.handleAt({ x: 300, y: 250 })).toBeUndefined();
      expect(picker.handleAt({ x: 900, y: 600 })).toBeUndefined();
      expect(new RegionPicker(display, 1).handleAt({ x: 1, y: 1 })).toBeUndefined();
    });

    it('moves only the edges a handle controls, and keeps the others where they were', () => {
      const picker = drawn();
      expect(picker.pointerDown({ x: 500, y: 250 })).toBeUndefined();
      picker.pointerMove({ x: 700, y: 999 });
      expect(picker.box).toEqual({ x: 100, y: 100, width: 600, height: 300 });
      picker.pointerUp({ x: 700, y: 999 });

      picker.pointerDown({ x: 100, y: 100 });
      picker.pointerMove({ x: 150, y: 120 });
      picker.pointerUp({ x: 150, y: 120 });
      expect(picker.box).toEqual({ x: 150, y: 120, width: 550, height: 280 });
    });

    it('never folds the box flat or lets it leave the display', () => {
      const picker = drawn();
      picker.pointerDown({ x: 500, y: 400 });
      picker.pointerMove({ x: 0, y: 0 });
      expect(picker.box?.width).toBe(16);
      expect(picker.box?.height).toBe(16);
      picker.pointerMove({ x: 9000, y: 9000 });
      expect(picker.box).toEqual({ x: 100, y: 100, width: 1180, height: 620 });
      picker.pointerUp({ x: 9000, y: 9000 });
    });

    it('does not report a new box when a handle is dragged', () => {
      const picker = drawn();
      expect(picker.pointerDown({ x: 300, y: 98 })).toBeUndefined();
    });
  });
});
