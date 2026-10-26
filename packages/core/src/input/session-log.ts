import { z } from 'zod';
import { isPaused, toMediaTime, type Pause } from '../clock';
import { err, ok, type Result } from '../result';
import type { RawInputEvent } from './raw-events';
import type { InputEvent } from './types';

const finite = z.number();
const nonNegative = z.number().nonnegative();
const button = z.enum(['left', 'right', 'middle']);

/** The saved input log, `<name>.scrim.json`. Version 1. Strict, and with no key event. */
export const sessionLogSchema = z.strictObject({
  version: z.literal(1),
  frame: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  events: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('move'), t: nonNegative, x: finite, y: finite }),
      z.strictObject({ type: z.literal('click'), t: nonNegative, x: finite, y: finite, button }),
      z.strictObject({ type: z.literal('release'), t: nonNegative, x: finite, y: finite, button }),
      z.strictObject({
        type: z.literal('wheel'),
        t: nonNegative,
        x: finite,
        y: finite,
        dx: finite,
        dy: finite,
      }),
    ]),
  ),
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
  const { startTime, pauses, frame, origin, scale } = options;
  const converted: InputEvent[] = [];
  const ordered = [...events].sort((a, b) => a.at - b.at);

  for (const event of ordered) {
    if (event.at < startTime || isPaused(event.at, pauses)) continue;
    const t = toMediaTime(event.at, startTime, pauses);
    const rawX = (event.x - origin.x) * scale;
    const rawY = (event.y - origin.y) * scale;
    const inside = rawX >= 0 && rawY >= 0 && rawX <= frame.width && rawY <= frame.height;
    const x = Math.min(Math.max(rawX, 0), frame.width);
    const y = Math.min(Math.max(rawY, 0), frame.height);

    switch (event.type) {
      case 'move':
        converted.push({ type: 'move', t, x, y });
        break;
      case 'down':
        if (inside) converted.push({ type: 'click', t, x, y, button: event.button });
        break;
      case 'up':
        if (inside) converted.push({ type: 'release', t, x, y, button: event.button });
        break;
      case 'wheel':
        if (inside) converted.push({ type: 'wheel', t, x, y, dx: event.dx, dy: event.dy });
        break;
    }
  }

  const parsed = sessionLogSchema.safeParse({ version: 1, frame, events: converted });
  if (!parsed.success) {
    return err({ code: 'invalid-log', message: parsed.error.message });
  }
  return ok(parsed.data);
}
