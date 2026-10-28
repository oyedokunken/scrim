/**
 * One stretch where the camera is zoomed in. The camera starts moving in at `startMs`, stays in
 * until `endMs`, then starts moving out. `x` and `y` are where it first aims, in frame pixels.
 * Times are on the recording clock. The editor lists, moves, stretches, adds and deletes these.
 */
export interface ZoomMoment {
  startMs: number;
  endMs: number;
  x: number;
  y: number;
}

/** The shortest moment the editor allows: long enough for the camera to arrive and show something. */
export const MIN_MOMENT_MS = 600;

/** Sorts by start time and joins moments that overlap. Returns new objects. */
export function normalizeMoments(moments: readonly ZoomMoment[], mergeGapMs = 0): ZoomMoment[] {
  const sorted = moments
    .filter((m) => Number.isFinite(m.startMs) && Number.isFinite(m.endMs) && m.endMs > m.startMs)
    .map((m) => ({ ...m, startMs: Math.max(0, m.startMs) }))
    .sort((a, b) => a.startMs - b.startMs);
  const out: ZoomMoment[] = [];
  for (const moment of sorted) {
    const previous = out[out.length - 1];
    if (previous !== undefined && moment.startMs < previous.endMs + mergeGapMs) {
      previous.endMs = Math.max(previous.endMs, moment.endMs);
    } else {
      out.push({ ...moment });
    }
  }
  return out;
}
