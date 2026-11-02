import { tidyMoments } from '@scrim/core/zoom';
import type { ZoomMoment } from '@scrim/core/zoom';
import type { TextItem } from '@scrim/core/render';

/** A stretch of the recording clock, in milliseconds. */
export interface Span {
  startMs: number;
  endMs: number;
}

/**
 * What the editor changes, in the shape of `edits.json`. `zoom` is absent until the person edits
 * a zoom moment; then the list in it replaces the one found from the clicks.
 */
export interface Edits {
  trim: Span | null;
  cuts: Span[];
  zoom?: { moments: ZoomMoment[] } | undefined;
  /** Text laid over the video. Absent when there is none. */
  texts?: TextItem[] | undefined;
}

const MIN_TRIM_MS = 500;
const MIN_CUT_MS = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cuts sorted, clipped to `[0, durationMs]`, joined where they touch, and dropped when tiny. */
export function tidyCuts(cuts: readonly Span[], durationMs: number): Span[] {
  const sorted = cuts
    .map((c) => ({
      startMs: clamp(c.startMs, 0, durationMs),
      endMs: clamp(c.endMs, 0, durationMs),
    }))
    .filter((c) => c.endMs - c.startMs >= MIN_CUT_MS)
    .sort((a, b) => a.startMs - b.startMs);
  const out: Span[] = [];
  for (const cut of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && cut.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, cut.endMs);
    } else {
      out.push({ ...cut });
    }
  }
  return out;
}

/** Sets the kept stretch. A trim that covers the whole recording is stored as no trim. */
export function setTrim(edits: Edits, startMs: number, endMs: number, durationMs: number): Edits {
  const start = clamp(startMs, 0, Math.max(0, durationMs - MIN_TRIM_MS));
  const end = clamp(endMs, start + MIN_TRIM_MS, durationMs);
  const whole = start <= 0 && end >= durationMs;
  return { ...edits, trim: whole ? null : { startMs: start, endMs: end } };
}

/** Adds a cut from the middle. It joins any cut it touches. */
export function addCut(edits: Edits, startMs: number, endMs: number, durationMs: number): Edits {
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  return { ...edits, cuts: tidyCuts([...edits.cuts, { startMs: from, endMs: to }], durationMs) };
}

/**
 * Changes the zoom moments. The first change starts from the moments the planner found, so
 * deleting one of them leaves the others as they were.
 */
export function editZoom(
  edits: Edits,
  planned: readonly ZoomMoment[],
  durationMs: number,
  change: (moments: ZoomMoment[]) => ZoomMoment[],
): Edits {
  const current = edits.zoom?.moments ?? tidyMoments(planned, durationMs);
  return { ...edits, zoom: { moments: change(current.map((m) => ({ ...m }))) } };
}

/** Puts the zoom back to what the planner finds on its own. */
export function resetZoom(edits: Edits): Edits {
  return edits.texts === undefined
    ? { trim: edits.trim, cuts: edits.cuts }
    : { trim: edits.trim, cuts: edits.cuts, texts: edits.texts };
}

function sameEdits(a: Edits, b: Edits): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface History {
  present: Edits;
  past: Edits[];
  future: Edits[];
}

const MAX_HISTORY = 100;

export function createHistory(present: Edits): History {
  return { present, past: [], future: [] };
}

/** Makes `next` the current edits and remembers the old ones. An unchanged value is ignored. */
export function commit(history: History, next: Edits): History {
  if (sameEdits(history.present, next)) return history;
  return {
    present: next,
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    present: previous,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    present: next,
    past: [...history.past, history.present],
    future: history.future.slice(1),
  };
}
