export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** The smallest box, in image pixels, that a crop or a drawn shape can have. */
export const MIN_BOX = 8;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** The box between two corners, whichever way the pointer was dragged. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** A box pulled inside the image. A box that is larger than the image becomes the whole image. */
export function clampRectTo(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    x: clamp(rect.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(rect.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}

/** A point held inside a box. */
export function clampPoint(point: Point, bounds: Rect): Point {
  return {
    x: clamp(point.x, bounds.x, bounds.x + bounds.width),
    y: clamp(point.y, bounds.y, bounds.y + bounds.height),
  };
}

/**
 * The crop a drag makes: the box between the press and the release, kept inside the visible area and
 * rounded to whole pixels so the saved image has an exact size. Null when it is too small to mean it.
 */
export function cropFromDrag(start: Point, end: Point, bounds: Rect): Rect | null {
  const a = clampPoint(start, bounds);
  const b = clampPoint(end, bounds);
  const box = rectFromPoints(a, b);
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const rect = {
    x,
    y,
    width: Math.round(box.x + box.width) - x,
    height: Math.round(box.y + box.height) - y,
  };
  return rect.width < MIN_BOX || rect.height < MIN_BOX ? null : rect;
}

/** How much a box of `content` is scaled to fit inside `available`, never above 1 (no upscaling). */
export function fitScale(content: Size, available: Size): number {
  if (content.width <= 0 || content.height <= 0) return 1;
  return Math.min(1, available.width / content.width, available.height / content.height);
}

/** A point on the screen canvas to the same point in the image. `view` is the visible part of the image. */
export function viewToImage(point: Point, view: Rect, scale: number): Point {
  return { x: view.x + point.x / scale, y: view.y + point.y / scale };
}

export function imageToView(point: Point, view: Rect, scale: number): Point {
  return { x: (point.x - view.x) * scale, y: (point.y - view.y) * scale };
}

/** The shortest distance from a point to a line segment. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function rectContains(rect: Rect, point: Point, slack = 0): boolean {
  return (
    point.x >= rect.x - slack &&
    point.x <= rect.x + rect.width + slack &&
    point.y >= rect.y - slack &&
    point.y <= rect.y + rect.height + slack
  );
}

/** The eight handles of a box, with the point each one sits on. */
export function handlePoints(rect: Rect): Record<Handle, Point> {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: midX, y: rect.y },
    ne: { x: right, y: rect.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: rect.x, y: bottom },
    w: { x: rect.x, y: midY },
  };
}

/** The handle under a point, or null. `reach` is the grab distance in image pixels. */
export function handleAt(rect: Rect, point: Point, reach: number): Handle | null {
  const points = handlePoints(rect);
  for (const handle of Object.keys(points) as Handle[]) {
    const at = points[handle];
    if (Math.hypot(point.x - at.x, point.y - at.y) <= reach) return handle;
  }
  return null;
}

/**
 * A box after one of its handles is dragged to `to`. The opposite edge stays put, the box never
 * flips or shrinks below the minimum, and it stays inside `bounds`.
 */
export function resizeRect(rect: Rect, handle: Handle, to: Point, bounds: Rect): Rect {
  const target = clampPoint(to, bounds);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes('w')) left = Math.min(target.x, right - MIN_BOX);
  if (handle.includes('e')) right = Math.max(target.x, left + MIN_BOX);
  if (handle.includes('n')) top = Math.min(target.y, bottom - MIN_BOX);
  if (handle.includes('s')) bottom = Math.max(target.y, top + MIN_BOX);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
