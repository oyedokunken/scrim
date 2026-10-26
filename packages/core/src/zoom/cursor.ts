import type { Frame, InputEvent } from '../input/types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the cursor was at time `t`, found by interpolating between the logged positions on
 * either side. Events must be sorted by time. Outside the logged range the nearest position
 * holds, and an empty log puts the cursor at the center of the frame.
 */
export function cursorAt(events: readonly InputEvent[], t: number, frame: Frame): Point {
  const first = events[0];
  const last = events[events.length - 1];
  if (first === undefined || last === undefined) {
    return { x: frame.width / 2, y: frame.height / 2 };
  }
  if (t <= first.t) {
    return { x: first.x, y: first.y };
  }
  if (t >= last.t) {
    return { x: last.x, y: last.y };
  }

  let low = 0;
  let high = events.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    const candidate = events[middle];
    if (candidate !== undefined && candidate.t <= t) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const from = events[low];
  const to = events[high];
  if (from === undefined || to === undefined) {
    return { x: last.x, y: last.y };
  }
  const span = to.t - from.t;
  const amount = span > 0 ? (t - from.t) / span : 1;
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}
