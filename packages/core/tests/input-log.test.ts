import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  coalesceMoves,
  formatInputLine,
  parseInputNdjson,
  rawInputEventSchema,
  sessionLogSchema,
  toSessionLog,
  type RawInputEvent,
} from '../src';

const move = (at: number, x = 0, y = 0): RawInputEvent => ({ type: 'move', at, x, y });
const down = (at: number, x = 0, y = 0): RawInputEvent => ({
  type: 'down',
  at,
  x,
  y,
  button: 'left',
});

describe('parseInputNdjson', () => {
  it('reads complete lines and reports a clean log', () => {
    const text = [move(1, 2, 3), down(5, 2, 3)].map(formatInputLine).join('');
    expect(parseInputNdjson(text)).toEqual({
      events: [move(1, 2, 3), down(5, 2, 3)],
      skipped: 0,
      truncatedTail: false,
    });
  });

  it('reads an empty log', () => {
    expect(parseInputNdjson('')).toEqual({ events: [], skipped: 0, truncatedTail: false });
  });

  it('drops a half written last line and says so', () => {
    const text = `${formatInputLine(move(1))}{"type":"move","at":2,"x":`;
    const parsed = parseInputNdjson(text);
    expect(parsed.events).toEqual([move(1)]);
    expect(parsed.truncatedTail).toBe(true);
    expect(parsed.skipped).toBe(0);
  });

  it('reads a last line that has no newline but is complete', () => {
    const parsed = parseInputNdjson(JSON.stringify(move(1)));
    expect(parsed.events).toEqual([move(1)]);
    expect(parsed.truncatedTail).toBe(false);
  });

  it('skips and counts a broken line in the middle', () => {
    const text = `${formatInputLine(move(1))}not json\n${formatInputLine(move(3))}`;
    const parsed = parseInputNdjson(text);
    expect(parsed.events.map((event) => event.at)).toEqual([1, 3]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.truncatedTail).toBe(false);
  });

  it('survives a cut at every byte offset', () => {
    const text = [move(1, 2, 3), down(5, 2, 3), move(9, 4, 4)].map(formatInputLine).join('');
    for (let cut = 0; cut <= text.length; cut += 1) {
      const parsed = parseInputNdjson(text.slice(0, cut));
      expect(parsed.events.length).toBeLessThanOrEqual(3);
      expect(parsed.skipped).toBe(0);
    }
  });
});

describe('no keyboard events', () => {
  const keyLines = [
    { type: 'key', at: 1, key: 'a' },
    { type: 'keydown', at: 1, keycode: 30 },
    { type: 'move', at: 1, x: 0, y: 0, key: 'a' },
    { type: 'down', at: 1, x: 0, y: 0, button: 'left', keycode: 30 },
  ];

  it.each(keyLines)('the raw schema rejects %j', (line) => {
    expect(rawInputEventSchema.safeParse(line).success).toBe(false);
  });

  it('keeps a key line out of a parsed log', () => {
    const text = keyLines.map((line) => `${JSON.stringify(line)}\n`).join('');
    const parsed = parseInputNdjson(text);
    expect(parsed.events).toEqual([]);
    expect(parsed.skipped).toBe(keyLines.length);
  });

  it('the saved log schema rejects a key event as well', () => {
    const log = {
      version: 1,
      frame: { width: 10, height: 10 },
      events: [{ type: 'key', t: 1, key: 'a' }],
    };
    expect(sessionLogSchema.safeParse(log).success).toBe(false);
  });
});

describe('coalesceMoves', () => {
  it('thins a burst of moves to the rate', () => {
    const burst = Array.from({ length: 1000 }, (_, i) => move(i, i, i));
    const thinned = coalesceMoves(burst, 120);
    expect(thinned.length).toBeLessThan(140);
    expect(thinned.length).toBeGreaterThan(100);
    expect(thinned[0]).toEqual(burst[0]);
  });

  it('keeps every click, release and wheel event', () => {
    const events: RawInputEvent[] = [
      move(0),
      down(1),
      { type: 'up', at: 2, x: 0, y: 0, button: 'left' },
      { type: 'wheel', at: 3, x: 0, y: 0, dx: 0, dy: 120 },
      { type: 'wheel', at: 4, x: 0, y: 0, dx: 0, dy: 120 },
    ];
    expect(coalesceMoves(events)).toEqual(events);
  });

  it('puts the latest dropped move in front of a click, so the cursor is where it was', () => {
    const events = [move(0, 0, 0), move(2, 5, 5), move(4, 9, 9), down(5, 9, 9)];
    const out = coalesceMoves(events, 120);
    expect(out).toEqual([move(0, 0, 0), move(4, 9, 9), down(5, 9, 9)]);
  });

  it('ends on the last position', () => {
    const out = coalesceMoves([move(0, 0, 0), move(3, 7, 7)], 120);
    expect(out.at(-1)).toEqual(move(3, 7, 7));
  });

  it('keeps order and never invents events', () => {
    const eventArb = fc.oneof(
      fc.record({
        type: fc.constant('move' as const),
        at: fc.integer({ min: 0, max: 1000 }),
        x: fc.integer({ min: 0, max: 100 }),
        y: fc.integer({ min: 0, max: 100 }),
      }),
      fc.record({
        type: fc.constant('down' as const),
        at: fc.integer({ min: 0, max: 1000 }),
        x: fc.integer({ min: 0, max: 100 }),
        y: fc.integer({ min: 0, max: 100 }),
        button: fc.constant('left' as const),
      }),
    );
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 80 }), (raw) => {
        const events = [...raw].sort((a, b) => a.at - b.at);
        const out = coalesceMoves(events);
        expect(out.length).toBeLessThanOrEqual(events.length);
        const times = out.map((event) => event.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(out.filter((e) => e.type === 'down')).toHaveLength(
          events.filter((e) => e.type === 'down').length,
        );
        for (const event of out) expect(events).toContainEqual(event);
      }),
    );
  });
});

describe('toSessionLog', () => {
  const base = {
    startTime: 1000,
    pauses: [],
    frame: { width: 1920, height: 1080 },
    origin: { x: 0, y: 0 },
    scale: 1,
  };

  const unwrap = (result: ReturnType<typeof toSessionLog>) => {
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  it('converts to media time and frame pixels, and labels the version', () => {
    const log = unwrap(
      toSessionLog([move(1500, 100, 50), down(2000, 100, 50)], {
        ...base,
        origin: { x: 20, y: 10 },
        scale: 2,
      }),
    );
    expect(log.version).toBe(1);
    expect(log.frame).toEqual({ width: 1920, height: 1080 });
    expect(log.events).toEqual([
      { type: 'move', t: 500, x: 160, y: 80 },
      { type: 'click', t: 1000, x: 160, y: 80, button: 'left' },
    ]);
  });

  it('drops events before the start and events during a pause', () => {
    const log = unwrap(
      toSessionLog([move(900), move(1500), move(2500), move(3500)], {
        ...base,
        pauses: [{ pausedAt: 2000, resumedAt: 3000 }],
      }),
    );
    expect(log.events.map((event) => event.t)).toEqual([500, 1500]);
  });

  it('closes the pause timeline so later events line up with the video', () => {
    const log = unwrap(
      toSessionLog([down(3500)], { ...base, pauses: [{ pausedAt: 2000, resumedAt: 3000 }] }),
    );
    expect(log.events[0]?.t).toBe(1500);
  });

  it('holds a move outside the recorded area at the edge and drops a click there', () => {
    const log = unwrap(
      toSessionLog(
        [
          move(1100, 5000, -20),
          down(1200, 5000, -20),
          { type: 'up', at: 1300, x: 5000, y: 5, button: 'left' },
        ],
        base,
      ),
    );
    expect(log.events).toEqual([{ type: 'move', t: 100, x: 1920, y: 0 }]);
  });

  it('keeps release and wheel events that are inside', () => {
    const log = unwrap(
      toSessionLog(
        [
          { type: 'up', at: 1100, x: 5, y: 5, button: 'right' },
          { type: 'wheel', at: 1200, x: 6, y: 6, dx: 0, dy: -120 },
        ],
        base,
      ),
    );
    expect(log.events.map((event) => event.type)).toEqual(['release', 'wheel']);
  });

  it('sorts events that arrive out of order', () => {
    const log = unwrap(toSessionLog([move(1500), move(1100)], base));
    expect(log.events.map((event) => event.t)).toEqual([100, 500]);
  });

  it('returns an error value when the frame is not valid', () => {
    const result = toSessionLog([move(1500)], { ...base, frame: { width: 0, height: 10 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-log');
  });

  it('always produces a log that passes the schema', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant('move' as const),
            at: fc.integer({ min: 0, max: 20_000 }),
            x: fc.integer({ min: -500, max: 4000 }),
            y: fc.integer({ min: -500, max: 3000 }),
          }),
          { maxLength: 60 },
        ),
        (events) => {
          const result = toSessionLog(events, {
            ...base,
            pauses: [{ pausedAt: 5000, resumedAt: 8000 }],
          });
          expect(result.ok).toBe(true);
          if (result.ok) expect(sessionLogSchema.safeParse(result.value).success).toBe(true);
        },
      ),
    );
  });
});
