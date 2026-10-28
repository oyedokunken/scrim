import { describe, expect, it } from 'vitest';
import {
  BUBBLE,
  BUBBLE_DIAMETERS,
  cornerFromSetting,
  windowSizeFor,
  WINDOW_SIZE,
  cornerPositions,
  distanceToBubble,
  dodgeCorner,
  dotSideFor,
  easeBetween,
  hitRects,
  nearestCorner,
  windowOrigin,
} from '../../src/recorder/bubble/geometry';

const area = { x: 0, y: 0, width: 1920, height: 1040 };
const positions = cornerPositions(area, 52);

describe('cornerPositions', () => {
  it('puts the 180 pixel picture 24 pixels from the edges, above the pill at the bottom', () => {
    expect(positions.tl).toEqual({ x: 24, y: 24 });
    expect(positions.tr).toEqual({ x: 1920 - 24 - 180, y: 24 });
    expect(positions.bl).toEqual({ x: 24, y: 1040 - 24 - 52 - 180 });
    expect(positions.br).toEqual({ x: 1920 - 24 - 180, y: 1040 - 24 - 52 - 180 });
  });

  it('follows a work area that does not start at zero', () => {
    const second = cornerPositions({ x: 1920, y: 40, width: 1280, height: 720 });
    expect(second.tl).toEqual({ x: 1944, y: 64 });
    expect(second.bl.y).toBe(40 + 720 - 24 - 180);
  });
});

describe('the dot and the window', () => {
  it('puts the dot toward the middle of the display', () => {
    expect(dotSideFor('bl')).toBe('right');
    expect(dotSideFor('tl')).toBe('right');
    expect(dotSideFor('br')).toBe('left');
    expect(dotSideFor('tr')).toBe('left');
  });

  it('places the window so the picture itself lands on the corner spot', () => {
    expect(windowOrigin({ x: 24, y: 500 }, 'right')).toEqual({
      x: 24 - BUBBLE.pad,
      y: 500 - BUBBLE.pad,
    });
    const left = windowOrigin({ x: 1000, y: 500 }, 'left');
    expect(left.x + BUBBLE.pad + BUBBLE.dot + BUBBLE.gap).toBe(1000);
  });

  it('lets only the picture and the dot take the mouse', () => {
    const rects = hitRects('right');
    expect(rects).toHaveLength(BUBBLE.size);
    for (const rect of rects) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(WINDOW_SIZE.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(WINDOW_SIZE.height);
    }
    // The middle row is the widest, the top row is a sliver.
    expect(rects[90]?.width).toBeGreaterThan(170);
    expect(rects[0]?.width).toBeLessThan(40);
  });
});

describe('nearestCorner', () => {
  it('snaps a dropped picture to the closest corner', () => {
    expect(nearestCorner({ x: 300, y: 300 }, positions)).toBe('tl');
    expect(nearestCorner({ x: 1500, y: 700 }, positions)).toBe('br');
    expect(nearestCorner({ x: 1500, y: 100 }, positions)).toBe('tr');
    expect(nearestCorner({ x: 100, y: 800 }, positions)).toBe('bl');
  });
});

describe('distanceToBubble', () => {
  it('is zero over the picture and grows from its edge', () => {
    const topLeft = positions.bl;
    const center = { x: topLeft.x + 90, y: topLeft.y + 90 };
    expect(distanceToBubble(center, topLeft)).toBe(0);
    expect(distanceToBubble({ x: center.x + 190, y: center.y }, topLeft)).toBeCloseTo(100);
  });
});

describe('dodgeCorner', () => {
  const base = { current: 'bl' as const, positions, lastMoveAt: -10_000, now: 0 };
  const near = { x: positions.bl.x + 90 + 90 + 60, y: positions.bl.y + 90 };

  it('stays put while the cursor is farther than 120 pixels from the picture', () => {
    expect(dodgeCorner({ ...base, cursor: { x: 800, y: 300 } })).toBeUndefined();
    expect(dodgeCorner({ ...base, cursor: { x: near.x + 100, y: near.y } })).toBeUndefined();
  });

  it('moves to the free corner nearest to where it is when the cursor comes close', () => {
    // Cursor at the bottom left: the top left is the nearest corner that is still free.
    expect(dodgeCorner({ ...base, cursor: near })).toBe('tl');
  });

  it('chooses a corner the cursor is not close to', () => {
    const cursor = { x: positions.tl.x + 90, y: positions.tl.y + 90 };
    const bubbleAtTop = { ...base, current: 'tl' as const, cursor };
    const target = dodgeCorner(bubbleAtTop);
    expect(target).toBeDefined();
    expect(distanceToBubble(cursor, positions[target ?? 'tl'])).toBeGreaterThanOrEqual(120);
  });

  it('does not move again until 1.5 seconds after the last move', () => {
    expect(dodgeCorner({ ...base, cursor: near, now: 1000, lastMoveAt: 0 })).toBeUndefined();
    expect(dodgeCorner({ ...base, cursor: near, now: 1499, lastMoveAt: 0 })).toBeUndefined();
    expect(dodgeCorner({ ...base, cursor: near, now: 1500, lastMoveAt: 0 })).toBe('tl');
  });

  it('never jumps away from the hand that is dragging it', () => {
    expect(dodgeCorner({ ...base, cursor: near, dragging: true })).toBeUndefined();
  });

  it('picks the corner farthest from the cursor when every corner is close to it', () => {
    const tiny = cornerPositions({ x: 0, y: 0, width: 420, height: 420 });
    const cursor = { x: 210, y: 210 };
    const target = dodgeCorner({
      current: 'tl',
      positions: tiny,
      cursor,
      now: 5000,
      lastMoveAt: 0,
    });
    expect(target).toBeDefined();
    expect(target).not.toBe('tl');
  });
});

describe('easeBetween', () => {
  it('starts at the start, ends at the end and never overshoots', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: -50 };
    expect(easeBetween(from, to, 0)).toEqual(from);
    expect(easeBetween(from, to, 1)).toEqual(to);
    expect(easeBetween(from, to, 2)).toEqual(to);
    const half = easeBetween(from, to, 0.5);
    expect(half.x).toBeGreaterThan(50);
    expect(half.x).toBeLessThan(100);
  });
});

describe('sizes and shapes', () => {
  it('has three sizes, in order', () => {
    expect(BUBBLE_DIAMETERS).toEqual({ S: 120, M: 180, L: 240 });
  });

  it('sizes the window and the corners from the diameter', () => {
    expect(windowSizeFor(240).width).toBe(WINDOW_SIZE.width + 60);
    expect(windowSizeFor().height).toBe(WINDOW_SIZE.height);
    const large = cornerPositions(area, 52, 240);
    expect(large.br.x).toBe(area.x + area.width - BUBBLE.margin - 240);
    expect(large.br.y).toBe(area.y + area.height - BUBBLE.margin - 52 - 240);
  });

  it('measures distance from the edge of a picture of any size', () => {
    const topLeft = { x: 100, y: 100 };
    expect(distanceToBubble({ x: 100 + 60 + 160, y: 160 }, topLeft, 120)).toBeCloseTo(100);
  });

  it('gives one hit row per pixel, and a rounded square is wider than a circle at the top', () => {
    const round = hitRects('right', 120, 'circle');
    const square = hitRects('right', 120, 'rounded-square');
    expect(round).toHaveLength(120);
    expect(square).toHaveLength(120);
    expect(square[0]?.width).toBeGreaterThan(round[0]?.width ?? 0);
    expect(square[60]?.width).toBe(120);
  });

  it('maps the settings corners', () => {
    expect(cornerFromSetting('top-left')).toBe('tl');
    expect(cornerFromSetting('top-right')).toBe('tr');
    expect(cornerFromSetting('bottom-left')).toBe('bl');
    expect(cornerFromSetting('bottom-right')).toBe('br');
  });
});
