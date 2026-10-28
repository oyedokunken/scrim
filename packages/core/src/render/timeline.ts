import type { EditList } from '../edit/edit-list';

/** One kept stretch: output time `outStart` to `outEnd` plays recording time from `srcStart`. */
export interface Segment {
  outStart: number;
  outEnd: number;
  srcStart: number;
}

export interface Timeline {
  segments: readonly Segment[];
  /** Length of the finished video: the recording minus the trim and the cuts. */
  totalMs: number;
}

/**
 * Builds the map from output time to recording time. Times are the recording clock in
 * milliseconds, with paused time already left out by the recorder. Cuts are clipped to the trim,
 * sorted and merged, so a sloppy list still gives a valid timeline: no cut stretch is ever shown.
 */
export function buildTimeline(
  durationMs: number,
  edits: Pick<EditList, 'trim' | 'cuts'>,
): Timeline {
  const end = Math.max(0, Math.min(edits.trim?.endMs ?? durationMs, durationMs));
  const start = Math.min(Math.max(0, edits.trim?.startMs ?? 0), end);

  const cuts = edits.cuts
    .map((cut) => ({ s: Math.max(cut.startMs, start), e: Math.min(cut.endMs, end) }))
    .filter((cut) => cut.e > cut.s)
    .sort((a, b) => a.s - b.s);

  const segments: Segment[] = [];
  let cursor = start;
  let out = 0;
  const keep = (from: number, to: number): void => {
    if (to <= from) return;
    segments.push({ outStart: out, outEnd: out + (to - from), srcStart: from });
    out += to - from;
  };
  for (const cut of cuts) {
    keep(cursor, cut.s);
    cursor = Math.max(cursor, cut.e);
  }
  keep(cursor, end);
  return { segments, totalMs: out };
}

/** Recording time for an output time. Clamped to the ends, and monotonic in `outMs`. */
export function outputToSource(timeline: Timeline, outMs: number): number {
  const last = timeline.segments[timeline.segments.length - 1];
  if (last === undefined) return 0;
  const t = Math.min(Math.max(0, outMs), timeline.totalMs);
  let low = 0;
  let high = timeline.segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const segment = timeline.segments[middle];
    if (segment !== undefined && segment.outStart <= t) low = middle;
    else high = middle - 1;
  }
  const segment = timeline.segments[low] ?? last;
  return segment.srcStart + (t - segment.outStart);
}

/** Output time for a recording time, or null when that moment was cut or trimmed away. */
export function sourceToOutput(timeline: Timeline, srcMs: number): number | null {
  for (const segment of timeline.segments) {
    const length = segment.outEnd - segment.outStart;
    if (srcMs >= segment.srcStart && srcMs < segment.srcStart + length) {
      return segment.outStart + (srcMs - segment.srcStart);
    }
  }
  return null;
}

/** Number of output frames at a constant rate. Every frame time is below the total. */
export function frameCount(totalMs: number, fps: number): number {
  return totalMs <= 0 ? 0 : Math.ceil((totalMs * fps) / 1000);
}

/** Output time of frame `index`, in milliseconds. */
export function frameTime(index: number, fps: number): number {
  return (index * 1000) / fps;
}

/**
 * Which decoded source frame to show at `timeMs` on the track's own clock. `pts` is the sorted
 * list of frame times the decoder produced. The last frame at or before the time wins, so the
 * last frame is held for as long as needed, up to the track's stop (ADR 0001). Before the first
 * frame the first one is shown. Returns -1 when there are no frames.
 */
export function pickFrame(pts: readonly number[], timeMs: number): number {
  if (pts.length === 0) return -1;
  let low = 0;
  let high = pts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const value = pts[middle];
    if (value !== undefined && value <= timeMs) low = middle;
    else high = middle - 1;
  }
  return low;
}
