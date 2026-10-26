import { z } from 'zod';

const finite = z.number();
const button = z.enum(['left', 'right', 'middle']);

/**
 * One line of `input.ndjson`, written while recording. `at` is milliseconds on the main clock and
 * `x` and `y` are device independent pixels on the desktop. The schemas are strict and there is
 * no key event: a line that mentions a key does not parse, so keystrokes cannot reach the log.
 */
export const rawInputEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('move'), at: finite, x: finite, y: finite }),
  z.strictObject({ type: z.literal('down'), at: finite, x: finite, y: finite, button }),
  z.strictObject({ type: z.literal('up'), at: finite, x: finite, y: finite, button }),
  z.strictObject({
    type: z.literal('wheel'),
    at: finite,
    x: finite,
    y: finite,
    dx: finite,
    dy: finite,
  }),
]);

export type RawInputEvent = z.infer<typeof rawInputEventSchema>;

export interface ParsedNdjson {
  events: RawInputEvent[];
  /** Complete lines that were not valid events and were left out. */
  skipped: number;
  /** The last line was cut off, as after a crash, and was left out. */
  truncatedTail: boolean;
}

/**
 * Reads `input.ndjson`. A log from a crashed recording usually ends in a half written line, so
 * the last line is dropped when it does not parse, and that is reported rather than treated as
 * an error. A bad line in the middle is skipped and counted.
 */
export function parseInputNdjson(text: string): ParsedNdjson {
  const lines = text.split('\n');
  const endsCleanly = text.endsWith('\n') || text === '';
  const events: RawInputEvent[] = [];
  let skipped = 0;
  let truncatedTail = false;

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    const isLast = index === lines.length - 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (isLast && !endsCleanly) truncatedTail = true;
      else skipped += 1;
      continue;
    }
    const result = rawInputEventSchema.safeParse(parsed);
    if (result.success) events.push(result.data);
    else skipped += 1;
  }
  return { events, skipped, truncatedTail };
}

/** One event as a line for `input.ndjson`, with the newline. */
export function formatInputLine(event: RawInputEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** Roughly 120 moves a second is more than any display shows, and keeps the log small. */
export const DEFAULT_MOVE_HZ = 120;

export interface MoveCoalescer {
  /** Feed one event. Returns the events to keep now, in order: none, one, or two. */
  push(event: RawInputEvent): RawInputEvent[];
  /** Returns the last held move, if any. Call it when the stream ends or pauses. */
  flush(): RawInputEvent[];
}

/**
 * Thins mouse moves to at most `hz` a second, as a stream. Every click, release and wheel event is
 * kept. The latest move that was dropped is kept again just before a non move event and at the
 * end, so the cursor is never shown somewhere it was not when a click happens. Order is kept.
 */
export function createMoveCoalescer(hz: number = DEFAULT_MOVE_HZ): MoveCoalescer {
  const interval = 1000 / hz;
  let lastKeptMoveAt = Number.NEGATIVE_INFINITY;
  let pending: RawInputEvent | undefined;

  const flush = (): RawInputEvent[] => {
    if (pending === undefined) return [];
    const held = pending;
    pending = undefined;
    lastKeptMoveAt = held.at;
    return [held];
  };

  return {
    push(event) {
      if (event.type !== 'move') return [...flush(), event];
      if (event.at - lastKeptMoveAt >= interval) {
        pending = undefined;
        lastKeptMoveAt = event.at;
        return [event];
      }
      pending = event;
      return [];
    },
    flush,
  };
}

/** The same thinning for a log that is already complete. */
export function coalesceMoves(
  events: readonly RawInputEvent[],
  hz: number = DEFAULT_MOVE_HZ,
): RawInputEvent[] {
  const coalescer = createMoveCoalescer(hz);
  return [...events.flatMap((event) => coalescer.push(event)), ...coalescer.flush()];
}
