import { z } from 'zod';

/** The pill, in device independent pixels. A single compact bar. */
export const PILL_SIZE = { width: 232, height: 40 } as const;
/** The gap to the edges of the display, in device independent pixels. */
export const PILL_MARGIN = 24;

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

export const pillPositionSchema = z.strictObject({
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
});

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function pillAt(point: Point): Rect {
  return { ...point, ...PILL_SIZE };
}

/**
 * Where the pill starts: the bottom left of the display being recorded, 24 pixels from the edges.
 * When that spot sits on the recorded area and another corner is free, it takes the first free
 * corner (bottom right, top left, top right), so it stays out of the picture when there is room.
 */
export function defaultPillPosition(workArea: Rect, recorded?: Rect): Point {
  const left = workArea.x + PILL_MARGIN;
  const right = workArea.x + workArea.width - PILL_MARGIN - PILL_SIZE.width;
  const top = workArea.y + PILL_MARGIN;
  const bottom = workArea.y + workArea.height - PILL_MARGIN - PILL_SIZE.height;
  const corners: Point[] = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ];
  const first = corners[0] ?? { x: left, y: bottom };
  if (recorded === undefined) return first;
  return corners.find((corner) => !overlaps(pillAt(corner), recorded)) ?? first;
}

/** True when the whole pill sits inside one of the work areas. */
export function isOnScreen(point: Point, workAreas: readonly Rect[]): boolean {
  const pill = pillAt(point);
  return workAreas.some(
    (area) =>
      pill.x >= area.x &&
      pill.y >= area.y &&
      pill.x + pill.width <= area.x + area.width &&
      pill.y + pill.height <= area.y + area.height,
  );
}

/** The remembered spot when a display still shows it, and otherwise the default for this display. */
export function resolvePillPosition(options: {
  saved: Point | undefined;
  workArea: Rect;
  workAreas: readonly Rect[];
  recorded?: Rect;
}): Point {
  const { saved, workArea, workAreas, recorded } = options;
  if (saved !== undefined && isOnScreen(saved, workAreas)) return saved;
  return defaultPillPosition(workArea, recorded);
}
