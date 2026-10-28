import type { Timeline } from './timeline';

/**
 * One stretch of the finished audio. When `micStartMs` is null the stretch is silence, because the
 * microphone had not started yet or had already stopped. Otherwise it plays the microphone file
 * from `micStartMs`, in the microphone's own time.
 */
export interface AudioPiece {
  outStartMs: number;
  durationMs: number;
  micStartMs: number | null;
}

/**
 * Maps the kept stretches of the recording onto the microphone file. `offsetMs` is where the
 * microphone's time zero sits on the recording clock, and `lengthMs` is how long the microphone
 * ran (from its stop time, never the container). The pieces are in output order, cover the whole
 * output without gaps, and add up to the timeline length.
 */
export function planAudio(timeline: Timeline, offsetMs: number, lengthMs: number): AudioPiece[] {
  const pieces: AudioPiece[] = [];
  const push = (outStartMs: number, durationMs: number, micStartMs: number | null): void => {
    if (durationMs > 0) pieces.push({ outStartMs, durationMs, micStartMs });
  };
  for (const segment of timeline.segments) {
    const length = segment.outEnd - segment.outStart;
    // The same stretch on the microphone's clock.
    const from = segment.srcStart - offsetMs;
    const to = from + length;
    const playFrom = Math.max(from, 0);
    const playTo = Math.min(to, Math.max(lengthMs, 0));
    if (playTo <= playFrom) {
      push(segment.outStart, length, null);
      continue;
    }
    push(segment.outStart, playFrom - from, null);
    push(segment.outStart + (playFrom - from), playTo - playFrom, playFrom);
    push(segment.outStart + (playTo - from), to - playTo, null);
  }
  return pieces;
}
