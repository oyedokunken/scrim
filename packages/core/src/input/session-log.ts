import { z } from 'zod';
import { isPaused, toMediaTime, type Pause } from '../clock';
import { err, ok, type Result } from '../result';
import type { RawInputEvent } from './raw-events';
import { boundsAt, type BoundsSample } from './window-bounds';
import type { InputEvent } from './types';

const finite = z.number();
const nonNegative = z.number().nonnegative();
const button = z.enum(['left', 'right', 'middle']);
const display = z.string().min(1).optional();

/** The saved input log, `<name>.scrim.json`. Version 1. Strict, and with no key event. */
export const sessionLogSchema = z.strictObject({
  version: z.literal(1),
  frame: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  events: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('move'), t: nonNegative, x: finite, y: finite, display }),
      z.strictObject({
        type: z.literal('click'),
        t: nonNegative,
        x: finite,
        y: finite,
        button,
        display,
      }),
      z.strictObject({
        type: z.literal('release'),
        t: nonNegative,
        x: finite,
        y: finite,
        button,
        display,
      }),
      z.strictObject({
        type: z.literal('wheel'),
        t: nonNegative,
        x: finite,
        y: finite,
        dx: finite,
        dy: finite,
        display,
      }),
    ]),
  ),
  /**
   * Where the recorded window was, over media time, in device independent pixels on the desktop.
   * Present only for a window recording that could follow the window. Mouse positions in `events`
   * are already relative to the window as it was at the time of each event.
   */
  windowBounds: z
    .array(
      z.strictObject({
        t: nonNegative,
        x: finite,
        y: finite,
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    )
    .optional(),
});

export type SessionLog = z.infer<typeof sessionLogSchema>;

export interface SessionLogOptions {
  /** When the recording started, on the main clock. */
  startTime: number;
  pauses: readonly Pause[];
  /** Size of the recorded video in pixels. */
  frame: { width: number; height: number };
  /** Top left of the recorded area in device independent pixels on the desktop. */
  origin: { x: number; y: number };
  /** Pixels per device independent pixel on the recorded display. */
  scale: number;
  /**
   * For a window recording: where the window was over time, on the main clock. Each event is then
   * placed relative to the window as it was at that moment, instead of relative to `origin`.
   */
  windowBounds?: readonly BoundsSample[] | undefined;
}

export type SessionLogError = { code: 'invalid-log'; message: string };

/**
 * Turns the raw main clock events into the saved log: media time instead of main time, pixels of
 * the recorded frame instead of desktop coordinates. Events before the start and events during a
 * pause are dropped, because no frame exists for them. A click, release or wheel outside the
 * recorded area is dropped, and a move outside it is held at the edge. The result is validated
 * against `sessionLogSchema`.
 */
export function toSessionLog(
  events: readonly RawInputEvent[],
  options: SessionLogOptions,
): Result<SessionLog, SessionLogError> {
  const { startTime, pauses, frame, origin, scale, windowBounds } = options;
  const converted: InputEvent[] = [];
  const ordered = [...events].sort((a, b) => a.at - b.at);

  for (const event of ordered) {
    if (event.at < startTime || isPaused(event.at, pauses)) continue;
    const t = toMediaTime(event.at, startTime, pauses);
    const placed = windowBounds === undefined ? undefined : boundsAt(windowBounds, event.at);
    const base = placed ?? origin;
    const rawX = (event.x - base.x) * scale;
    const rawY = (event.y - base.y) * scale;
    const inside = rawX >= 0 && rawY >= 0 && rawX <= frame.width && rawY <= frame.height;
    const x = Math.min(Math.max(rawX, 0), frame.width);
    const y = Math.min(Math.max(rawY, 0), frame.height);

    switch (event.type) {
      case 'move':
        converted.push({ type: 'move', t, x, y, ...displayOf(event) });
        break;
      case 'down':
        if (inside) {
          converted.push({ type: 'click', t, x, y, button: event.button, ...displayOf(event) });
        }
        break;
      case 'up':
        if (inside) {
          converted.push({ type: 'release', t, x, y, button: event.button, ...displayOf(event) });
        }
        break;
      case 'wheel':
        if (inside) {
          converted.push({
            type: 'wheel',
            t,
            x,
            y,
            dx: event.dx,
            dy: event.dy,
            ...displayOf(event),
          });
        }
        break;
    }
  }

  const parsed = sessionLogSchema.safeParse({
    version: 1,
    frame,
    events: converted,
    ...(windowBounds === undefined
      ? {}
      : { windowBounds: boundsOverMediaTime(windowBounds, startTime, pauses) }),
  });
  if (!parsed.success) {
    return err({ code: 'invalid-log', message: parsed.error.message });
  }
  return ok(parsed.data);
}

/** The display id of an event, as a spread that adds nothing when there is none. */
function displayOf(event: { display?: string | undefined }): { display?: string } {
  return event.display === undefined ? {} : { display: event.display };
}

/** Window positions on media time, dropping a sample that repeats the one before it. */
function boundsOverMediaTime(
  samples: readonly BoundsSample[],
  startTime: number,
  pauses: readonly Pause[],
): { t: number; x: number; y: number; width: number; height: number }[] {
  const out: { t: number; x: number; y: number; width: number; height: number }[] = [];
  for (const sample of [...samples].sort((a, b) => a.at - b.at)) {
    const previous = out[out.length - 1];
    const t = toMediaTime(Math.max(sample.at, startTime), startTime, pauses);
    const { x, y, width, height } = sample;
    if (
      previous !== undefined &&
      previous.x === x &&
      previous.y === y &&
      previous.width === width &&
      previous.height === height
    ) {
      continue;
    }
    out.push({ t, x, y, width, height });
  }
  return out;
}
