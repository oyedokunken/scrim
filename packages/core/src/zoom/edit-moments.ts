import { MIN_MOMENT_MS, normalizeMoments } from './moments';
import type { ZoomMoment } from './moments';

/**
 * Edits to the list of zoom moments, as pure functions the editor calls. Each returns a new list,
 * sorted, with no two moments overlapping, every moment inside `[0, durationMs]` and at least
 * `MIN_MOMENT_MS` long. The input list is never changed.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The list the editor works on: sorted and free of overlaps. */
export function tidyMoments(moments: readonly ZoomMoment[], durationMs: number): ZoomMoment[] {
  return normalizeMoments(moments)
    .map((m) => ({
      ...m,
      startMs: clamp(m.startMs, 0, durationMs),
      endMs: clamp(m.endMs, 0, durationMs),
    }))
    .filter((m) => m.endMs - m.startMs >= MIN_MOMENT_MS);
}

/** Removes one moment. An index that is not in the list changes nothing. */
export function deleteMoment(moments: readonly ZoomMoment[], index: number): ZoomMoment[] {
  return moments.filter((_, i) => i !== index).map((m) => ({ ...m }));
}

/** The room a moment has: from the end of the one before to the start of the one after. */
function room(
  moments: readonly ZoomMoment[],
  index: number,
  durationMs: number,
): { min: number; max: number } {
  const before = moments[index - 1];
  const after = moments[index + 1];
  return { min: before?.endMs ?? 0, max: after?.startMs ?? durationMs };
}

/** Slides a moment in time, keeping its length. It stops at its neighbours and at the ends. */
export function moveMoment(
  moments: readonly ZoomMoment[],
  index: number,
  deltaMs: number,
  durationMs: number,
): ZoomMoment[] {
  const target = moments[index];
  if (target === undefined) return moments.map((m) => ({ ...m }));
  const { min, max } = room(moments, index, durationMs);
  const length = target.endMs - target.startMs;
  const startMs = clamp(target.startMs + deltaMs, min, Math.max(min, max - length));
  return moments.map((m, i) =>
    i === index ? { ...m, startMs, endMs: startMs + length } : { ...m },
  );
}

/**
 * Drags one edge of a moment to a new time. The start edge changes when the zoom in begins and
 * the end edge changes how long the zoom holds. The moment keeps its minimum length and stops at
 * its neighbours and at the ends.
 */
export function resizeMoment(
  moments: readonly ZoomMoment[],
  index: number,
  edge: 'start' | 'end',
  timeMs: number,
  durationMs: number,
): ZoomMoment[] {
  const target = moments[index];
  if (target === undefined) return moments.map((m) => ({ ...m }));
  const { min, max } = room(moments, index, durationMs);
  return moments.map((m, i) => {
    if (i !== index) return { ...m };
    if (edge === 'start') {
      return { ...m, startMs: clamp(timeMs, min, Math.max(min, m.endMs - MIN_MOMENT_MS)) };
    }
    return { ...m, endMs: clamp(timeMs, Math.min(max, m.startMs + MIN_MOMENT_MS), max) };
  });
}

/**
 * Adds a moment that starts at `atMs`, aimed at `focus`, `lengthMs` long. It is shortened to fit
 * before the next moment. When the time is inside a moment, or there is no room for the minimum
 * length, the list is returned unchanged and `added` is false.
 */
export function addMoment(
  moments: readonly ZoomMoment[],
  atMs: number,
  focus: { x: number; y: number },
  lengthMs: number,
  durationMs: number,
): { moments: ZoomMoment[]; added: boolean; index: number } {
  const copy = moments.map((m) => ({ ...m }));
  const startMs = clamp(atMs, 0, durationMs);
  if (copy.some((m) => startMs >= m.startMs && startMs < m.endMs)) {
    return { moments: copy, added: false, index: -1 };
  }
  const next = copy.find((m) => m.startMs >= startMs);
  const limit = Math.min(durationMs, next?.startMs ?? durationMs);
  const endMs = Math.min(startMs + Math.max(lengthMs, MIN_MOMENT_MS), limit);
  if (endMs - startMs < MIN_MOMENT_MS) {
    return { moments: copy, added: false, index: -1 };
  }
  const added: ZoomMoment = { startMs, endMs, x: focus.x, y: focus.y };
  const list = [...copy, added].sort((a, b) => a.startMs - b.startMs);
  return { moments: list, added: true, index: list.indexOf(added) };
}

/** True when the list is what the planner would make on its own, so nothing needs saving. */
export function sameMoments(a: readonly ZoomMoment[], b: readonly ZoomMoment[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        Math.abs(m.startMs - other.startMs) < 1 &&
        Math.abs(m.endMs - other.endMs) < 1 &&
        Math.abs(m.x - other.x) < 1 &&
        Math.abs(m.y - other.y) < 1
      );
    })
  );
}

/**
 * What to call a moment in the list: "click" when a left click falls inside it, otherwise
 * "added". `clickTimes` are the times of the left clicks on the recording clock.
 */
export function momentKind(moment: ZoomMoment, clickTimes: readonly number[]): 'click' | 'added' {
  return clickTimes.some((t) => t >= moment.startMs && t <= moment.endMs) ? 'click' : 'added';
}
