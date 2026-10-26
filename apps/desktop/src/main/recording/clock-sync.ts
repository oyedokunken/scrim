/** One ping: main sent at `sentAt`, the page answered with its clock, main heard at `receivedAt`. */
export interface PingSample {
  sentAt: number;
  receivedAt: number;
  rendererNow: number;
}

export interface ClockOffset {
  /** Add this to a renderer `performance.now()` value to get main clock time. */
  offsetMs: number;
  /** The offset is right within this much. It is half the round trip of the best sample. */
  uncertaintyMs: number;
}

/**
 * Relates the page clock to the main clock. The page read its clock somewhere between the moment
 * main sent the ping and the moment main heard the answer, so the best guess is the midpoint, and
 * the error cannot be larger than half the round trip. The sample with the smallest round trip is
 * the most trustworthy. Returns undefined when there are no usable samples.
 */
export function estimateOffset(samples: readonly PingSample[]): ClockOffset | undefined {
  let best: PingSample | undefined;
  for (const sample of samples) {
    const trip = sample.receivedAt - sample.sentAt;
    if (!Number.isFinite(trip) || trip < 0) continue;
    if (best === undefined || trip < best.receivedAt - best.sentAt) best = sample;
  }
  if (best === undefined) return undefined;
  const midpoint = (best.sentAt + best.receivedAt) / 2;
  return {
    offsetMs: midpoint - best.rendererNow,
    uncertaintyMs: (best.receivedAt - best.sentAt) / 2,
  };
}

/** A renderer clock reading as main clock time. */
export function rendererToMain(rendererNow: number, offset: ClockOffset): number {
  return rendererNow + offset.offsetMs;
}
