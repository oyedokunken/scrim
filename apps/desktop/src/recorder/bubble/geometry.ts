/** The camera bubble and its microphone dot, in device independent pixels. All of it is pure. */

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BUBBLE = {
  /** The round picture, ring included. */
  size: 180,
  /** Room around the picture for the soft shadow. */
  pad: 12,
  /** The microphone dot, at its largest. */
  dot: 24,
  /** The gap between the picture and the dot. */
  gap: 8,
  /** The distance to the edges of the display. */
  margin: 24,
  /** The cursor this close to the picture (edge to cursor) makes it move away. */
  dodgeRadius: 120,
  /** After a move it stays put for at least this long. */
  dodgeCooldownMs: 1500,
  /** How long a move takes. */
  moveMs: 200,
} as const;

/** The three sizes the Camera page offers, as the picture's diameter. */
export const BUBBLE_DIAMETERS = { S: 120, M: 180, L: 240 } as const;

export type BubbleShape = 'circle' | 'rounded-square';

/** The corner radius of the rounded square, as a share of its side. */
const SQUARE_RADIUS = 0.22;

/** The window holds the picture, its shadow and the dot beside it. */
export function windowSizeFor(size: number = BUBBLE.size): { width: number; height: number } {
  return {
    width: BUBBLE.pad + size + BUBBLE.gap + BUBBLE.dot + BUBBLE.pad,
    height: BUBBLE.pad + size + BUBBLE.pad,
  };
}

export const WINDOW_SIZE = windowSizeFor();

/** The settings name of a corner, as the app's corner code. */
export function cornerFromSetting(
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
): Corner {
  switch (corner) {
    case 'top-left':
      return 'tl';
    case 'top-right':
      return 'tr';
    case 'bottom-left':
      return 'bl';
    case 'bottom-right':
      return 'br';
  }
}

/** The dot sits on the side of the picture that faces the middle of the display. */
export type DotSide = 'left' | 'right';

export function dotSideFor(corner: Corner): DotSide {
  return corner === 'tl' || corner === 'bl' ? 'right' : 'left';
}

/** Where the picture's top left goes for each corner of the work area. */
export function cornerPositions(
  area: Rect,
  /** Extra room kept at the bottom, so the picture clears the recording pill. */
  bottomInset = 0,
  size: number = BUBBLE.size,
): Record<Corner, Point> {
  const left = area.x + BUBBLE.margin;
  const right = area.x + area.width - BUBBLE.margin - size;
  const top = area.y + BUBBLE.margin;
  const bottom = area.y + area.height - BUBBLE.margin - bottomInset - size;
  return {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
  };
}

/** The window's top left for a picture at `circle`. */
export function windowOrigin(circle: Point, side: DotSide): Point {
  const toPicture = side === 'right' ? BUBBLE.pad : BUBBLE.pad + BUBBLE.dot + BUBBLE.gap;
  return { x: circle.x - toPicture, y: circle.y - BUBBLE.pad };
}

function centerOf(topLeft: Point, size: number): Point {
  return { x: topLeft.x + size / 2, y: topLeft.y + size / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How far the cursor is from the edge of the round picture, zero when it is over it. */
export function distanceToBubble(
  cursor: Point,
  topLeft: Point,
  size: number = BUBBLE.size,
): number {
  return Math.max(0, distance(cursor, centerOf(topLeft, size)) - size / 2);
}

/** The corner whose spot is closest to where the picture was let go. */
export function nearestCorner(topLeft: Point, positions: Record<Corner, Point>): Corner {
  let best: Corner = 'bl';
  let bestDistance = Infinity;
  for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
    const d = distance(topLeft, positions[corner]);
    if (d < bestDistance) {
      best = corner;
      bestDistance = d;
    }
  }
  return best;
}

export interface DodgeInput {
  current: Corner;
  positions: Record<Corner, Point>;
  cursor: Point;
  /** Milliseconds on any steady clock. */
  now: number;
  /** When the picture last moved on its own or was dropped by hand, on the same clock. */
  lastMoveAt: number;
  /** True while the person holds the picture, when it must never jump away. */
  dragging?: boolean;
  /** The picture's diameter. The medium size when left out. */
  size?: number;
}

/**
 * The corner to move to, or undefined to stay. It moves only when the cursor is within the dodge
 * radius of the picture and the last move was at least the cool down ago. It picks the free
 * corner nearest to where it is now, free meaning the cursor would be outside the radius there.
 * When no corner is free, the one farthest from the cursor.
 */
export function dodgeCorner(input: DodgeInput): Corner | undefined {
  if (input.dragging === true) return undefined;
  if (input.now - input.lastMoveAt < BUBBLE.dodgeCooldownMs) return undefined;
  const size = input.size ?? BUBBLE.size;
  const here = input.positions[input.current];
  if (distanceToBubble(input.cursor, here, size) >= BUBBLE.dodgeRadius) return undefined;
  const others = (['tl', 'tr', 'bl', 'br'] as const).filter((corner) => corner !== input.current);
  const free = others.filter(
    (corner) => distanceToBubble(input.cursor, input.positions[corner], size) >= BUBBLE.dodgeRadius,
  );
  const pool = free.length > 0 ? free : others;
  const score = (corner: Corner): number =>
    free.length > 0
      ? distance(here, input.positions[corner])
      : -distanceToBubble(input.cursor, input.positions[corner], size);
  return pool.reduce((best, corner) => (score(corner) < score(best) ? corner : best));
}

/** A smooth step between two points, `t` from 0 to 1, for the 200 ms move. */
export function easeBetween(from: Point, to: Point, t: number): Point {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) ** 3;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

/**
 * The parts of the window that take the mouse, as rows, so the rest of it clicks through to what
 * is underneath: the round picture and the round dot. In window coordinates.
 */
export function hitRects(
  side: DotSide,
  size: number = BUBBLE.size,
  shape: BubbleShape = 'circle',
): Rect[] {
  const rects: Rect[] = [];
  const pictureX = side === 'right' ? BUBBLE.pad : BUBBLE.pad + BUBBLE.dot + BUBBLE.gap;
  const radius = size / 2;
  const corner = size * SQUARE_RADIUS;
  for (let row = 0; row < size; row += 1) {
    const dy = row + 0.5 - radius;
    let half: number;
    if (shape === 'circle') {
      half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    } else {
      // Straight sides, with the rounded corners cut off at the top and bottom rows.
      const fromEdge = Math.min(row + 0.5, size - row - 0.5);
      const inset =
        fromEdge >= corner ? 0 : corner - Math.sqrt(corner * corner - (corner - fromEdge) ** 2);
      half = radius - inset;
    }
    const x = Math.round(radius - half);
    rects.push({
      x: pictureX + x,
      y: BUBBLE.pad + row,
      width: Math.max(1, Math.round(half * 2)),
      height: 1,
    });
  }
  return rects;
}
