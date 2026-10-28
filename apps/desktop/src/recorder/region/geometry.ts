/** A rectangle in device independent pixels, relative to the display it was drawn on. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Smallest area worth recording, in physical pixels on each side. */
export const MIN_REGION_PX = 64;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** The box between where a drag began and where the pointer is now, kept inside the display. */
export function dragRect(start: Point, current: Point, display: Size): Rect {
  const x1 = clamp(start.x, 0, display.width);
  const y1 = clamp(start.y, 0, display.height);
  const x2 = clamp(current.x, 0, display.width);
  const y2 = clamp(current.y, 0, display.height);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** The box moved by a drag from inside it, held inside the display. Its size does not change. */
export function moveRect(rect: Rect, dx: number, dy: number, display: Size): Rect {
  return {
    x: clamp(rect.x + dx, 0, Math.max(0, display.width - rect.width)),
    y: clamp(rect.y + dy, 0, Math.max(0, display.height - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export interface PixelRegion {
  /** Whole physical pixels on the display, with an even width and height. */
  px: Rect;
  /** The same area back in device independent pixels, which is how the session stores it. */
  dip: Rect;
}

/** An even length no shorter than `min`, as close to `length` as it can be, and no longer than `max`. */
function evenLength(length: number, min: number, max: number): number {
  const evenMax = max - (max % 2);
  const evenMin = min + (min % 2);
  const down = length - (length % 2);
  return clamp(down, evenMin, evenMax);
}

/**
 * Turns a box drawn in device independent pixels into whole physical pixels with an even width and
 * height, which H.264 needs, and gives the area back in device independent pixels. Each edge is
 * rounded on its own, so the result always lies on the pixel grid and never leaves the display.
 * Returns undefined when the box is smaller than `MIN_REGION_PX` on either side.
 */
export function toEvenPixels(rect: Rect, scale: number, display: Size): PixelRegion | undefined {
  const maxW = Math.round(display.width * scale);
  const maxH = Math.round(display.height * scale);
  const left = clamp(Math.round(rect.x * scale), 0, maxW);
  const top = clamp(Math.round(rect.y * scale), 0, maxH);
  const rawW = clamp(Math.round((rect.x + rect.width) * scale), 0, maxW) - left;
  const rawH = clamp(Math.round((rect.y + rect.height) * scale), 0, maxH) - top;
  if (rawW < MIN_REGION_PX || rawH < MIN_REGION_PX) return undefined;

  const width = evenLength(rawW, MIN_REGION_PX, maxW - left);
  const height = evenLength(rawH, MIN_REGION_PX, maxH - top);
  const px = { x: left, y: top, width, height };
  return {
    px,
    dip: { x: left / scale, y: top / scale, width: width / scale, height: height / scale },
  };
}

/** The size shown beside the box while it is drawn, in physical pixels. */
export function sizeLabel(px: Size): string {
  return `${String(px.width)} x ${String(px.height)}`;
}
