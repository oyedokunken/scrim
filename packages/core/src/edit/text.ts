import type { Timeline } from '../render/timeline';

/**
 * Text laid over the video. No runtime dependencies, so the render model and an export worker can
 * use it. The zod schema for `edits.json` lives in `text-schema.ts`.
 */

export const TEXT_SIZES = ['small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Palette names only. The hex values are in `TEXT_PAINT`. */
export const TEXT_COLORS = ['white', 'black', 'green', 'butter'] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export const TEXT_LIMITS = {
  maxLength: 120,
  maxItems: 100,
  minDurationMs: 200,
  /** Height of the letters as a fraction of the output height, per preset. */
  sizeFraction: { small: 0.04, medium: 0.065, large: 0.1 } satisfies Record<TextSize, number>,
  defaultDurationMs: 3000,
} as const;

/** Text colour and the chip behind it, from the brand palette. The chip is the opposite shade. */
export const TEXT_PAINT: Record<TextColor, { text: string; chip: string }> = {
  white: { text: '#FFFFFF', chip: '#000000' },
  black: { text: '#000000', chip: '#FFFFFF' },
  green: { text: '#004E52', chip: '#FBF8F4' },
  butter: { text: '#FBF8F4', chip: '#004E52' },
};

/** Opacity of the chip behind the text. */
export const TEXT_CHIP_ALPHA = 0.85;

/** One text item as saved in `edits.json`. Times are on the recording clock, in milliseconds. */
export interface TextItem {
  id: string;
  /** One line of plain text. Never markup. */
  text: string;
  startMs: number;
  endMs: number;
  /** Center of the text as a fraction of the finished frame, 0 to 1 from the top left. */
  x: number;
  y: number;
  size: TextSize;
  color: TextColor;
  /** A solid chip behind the text, for text that has to stay readable on any picture. */
  chip: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Plain text only. Control characters and angle brackets are dropped, so a pasted line of markup
 * shows as words and never as tags. Runs of spaces collapse and the length is capped.
 */
export function cleanText(raw: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const stripped = raw.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ');
  return stripped.trim().slice(0, TEXT_LIMITS.maxLength).trim();
}

/** True when `text` is already plain: what `cleanText` would return. */
export function isCleanText(text: string): boolean {
  return text.length > 0 && cleanText(text) === text;
}

/**
 * Puts one item inside the recording and the frame: times within `[0, durationMs]` with a minimum
 * length, the center within the frame, and clean text. Returns null when no text is left.
 */
export function clampTextItem(item: TextItem, durationMs: number): TextItem | null {
  const text = cleanText(item.text);
  if (text === '') return null;
  const total = Math.max(0, durationMs);
  const start = clamp(item.startMs, 0, Math.max(0, total - TEXT_LIMITS.minDurationMs));
  const end = clamp(item.endMs, start + TEXT_LIMITS.minDurationMs, Math.max(total, start));
  if (end <= start) return null;
  return {
    ...item,
    text,
    startMs: start,
    endMs: end,
    x: clamp(item.x, 0, 1),
    y: clamp(item.y, 0, 1),
  };
}

/** Clamps every item, drops the empty ones, caps the count and sorts by start. The sort is stable. */
export function tidyTexts(items: readonly TextItem[], durationMs: number): TextItem[] {
  const out: TextItem[] = [];
  for (const item of items) {
    const tidy = clampTextItem(item, durationMs);
    if (tidy !== null) out.push(tidy);
  }
  return out.sort((a, b) => a.startMs - b.startMs).slice(0, TEXT_LIMITS.maxItems);
}

/**
 * True when some part of the item is still on screen after the trim and the cuts. An item that
 * lies wholly inside a cut or outside the trim is never drawn, so callers can skip it.
 */
export function isTextVisible(item: TextItem, timeline: Timeline): boolean {
  return timeline.segments.some((segment) => {
    const length = segment.outEnd - segment.outStart;
    return item.startMs < segment.srcStart + length && item.endMs > segment.srcStart;
  });
}

/** The items on screen at recording time `recordingMs`, in the order they were given. */
export function activeTexts(items: readonly TextItem[], recordingMs: number): TextItem[] {
  return items.filter((item) => recordingMs >= item.startMs && recordingMs < item.endMs);
}

/** Where a new item goes: the playhead, three seconds long, low and centered. */
export function newTextItem(id: string, startMs: number, durationMs: number): TextItem {
  const start = clamp(startMs, 0, Math.max(0, durationMs - TEXT_LIMITS.minDurationMs));
  return {
    id,
    text: 'Your text',
    startMs: start,
    endMs: Math.min(
      Math.max(durationMs, start + TEXT_LIMITS.minDurationMs),
      start + TEXT_LIMITS.defaultDurationMs,
    ),
    x: 0.5,
    y: 0.85,
    size: 'medium',
    color: 'white',
    chip: true,
  };
}
