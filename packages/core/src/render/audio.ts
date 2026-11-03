import type { Timeline } from './timeline';
import type { OffInterval } from './toggles';

/**
 * One stretch of the finished audio. When `micStartMs` is null the stretch is silence, because the
 * microphone had not started yet, had already stopped, or was muted. Otherwise it plays the
 * microphone file from `micStartMs`, in the microphone's own time.
 */
export interface AudioPiece {
  outStartMs: number;
  durationMs: number;
  micStartMs: number | null;
}

/**
 * Maps the kept stretches of the recording onto the microphone file. `offsetMs` is where the
 * microphone's time zero sits on the recording clock, and `lengthMs` is how long the microphone
 * ran (from its stop time, never the container). `muted` lists the stretches, on the recording
 * clock, in which the microphone button was off: they become silence whatever the file holds. The
 * pieces are in output order, cover the whole output without gaps, and add up to the timeline
 * length.
 */
export function planAudio(
  timeline: Timeline,
  offsetMs: number,
  lengthMs: number,
  muted: readonly OffInterval[] = [],
): AudioPiece[] {
  const pieces: AudioPiece[] = [];
  const push = (outStartMs: number, durationMs: number, micStartMs: number | null): void => {
    if (durationMs > 0) pieces.push({ outStartMs, durationMs, micStartMs });
  };
  for (const segment of timeline.segments) {
    const segLength = segment.outEnd - segment.outStart;
    // Cut the segment at the edges of every muted stretch, in recording time.
    const first = segment.srcStart;
    const last = segment.srcStart + segLength;
    const edges = [first, last];
    for (const interval of muted) {
      for (const edge of [interval.fromMs, interval.toMs]) {
        if (edge > first && edge < last) edges.push(edge);
      }
    }
    edges.sort((a, b) => a - b);
    for (let i = 0; i + 1 < edges.length; i += 1) {
      const runStart = edges[i] ?? 0;
      const runEnd = edges[i + 1] ?? 0;
      const length = runEnd - runStart;
      if (length <= 0) continue;
      const outStart = segment.outStart + (runStart - segment.srcStart);
      const middle = runStart + length / 2;
      if (muted.some((interval) => middle >= interval.fromMs && middle < interval.toMs)) {
        push(outStart, length, null);
        continue;
      }
      // The same stretch on the microphone's clock.
      const from = runStart - offsetMs;
      const to = from + length;
      const playFrom = Math.max(from, 0);
      const playTo = Math.min(to, Math.max(lengthMs, 0));
      if (playTo <= playFrom) {
        push(outStart, length, null);
        continue;
      }
      push(outStart, playFrom - from, null);
      push(outStart + (playFrom - from), playTo - playFrom, playFrom);
      push(outStart + (playTo - from), to - playTo, null);
    }
  }
  return pieces;
}
