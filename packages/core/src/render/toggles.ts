/** Which device a toggle is about. */
export type ToggleKind = 'mic' | 'camera';

/** One press of the microphone or camera button while recording, on the recording clock. */
export interface ToggleEntry {
  kind: ToggleKind;
  on: boolean;
  /** Milliseconds of recorded time, with paused time left out. */
  t: number;
}

/** A stretch of recorded time, half open: `fromMs` is inside, `toMs` is not. */
export interface OffInterval {
  fromMs: number;
  /** Infinity when the device stayed off until the recording ended. */
  toMs: number;
}

/**
 * The stretches in which a device was switched off, in order and never overlapping. A device is on
 * until its first entry says otherwise. Entries are read in order of time, and a repeat of the
 * state it already has changes nothing, so a noisy log gives the same answer as a tidy one.
 */
export function offIntervals(
  toggles: readonly ToggleEntry[] | undefined,
  kind: ToggleKind,
): OffInterval[] {
  const entries = (toggles ?? [])
    .filter((entry) => entry.kind === kind)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.t - b.entry.t || a.index - b.index)
    .map(({ entry }) => entry);
  const out: OffInterval[] = [];
  let from: number | null = null;
  for (const entry of entries) {
    if (!entry.on && from === null) {
      from = entry.t;
    } else if (entry.on && from !== null) {
      if (entry.t > from) out.push({ fromMs: from, toMs: entry.t });
      from = null;
    }
  }
  if (from !== null) out.push({ fromMs: from, toMs: Infinity });
  return out;
}

/** Whether the device was off at a time on the recording clock. */
export function isOffAt(intervals: readonly OffInterval[], timeMs: number): boolean {
  return intervals.some((interval) => timeMs >= interval.fromMs && timeMs < interval.toMs);
}
