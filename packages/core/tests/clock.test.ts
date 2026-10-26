import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  isActive,
  isPaused,
  nextPhase,
  toMediaTime,
  validatePauses,
  type Pause,
  type RecorderEvent,
  type RecorderPhase,
} from '../src';

/** Valid, ordered pauses built from alternating gaps and lengths, all after `start`. */
const pausesFrom = (start: number, parts: readonly (readonly [number, number])[]): Pause[] => {
  const pauses: Pause[] = [];
  let cursor = start;
  for (const [gap, length] of parts) {
    const pausedAt = cursor + gap;
    pauses.push({ pausedAt, resumedAt: pausedAt + length });
    cursor = pausedAt + length;
  }
  return pauses;
};

const partsArb = fc.array(
  fc.tuple(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 5000 })),
  { maxLength: 8 },
);

describe('toMediaTime', () => {
  it('is wall time with no pauses, and zero before the start', () => {
    expect(toMediaTime(1500, 1000, [])).toBe(500);
    expect(toMediaTime(900, 1000, [])).toBe(0);
  });

  it('subtracts a finished pause once the recording is past it', () => {
    const pauses = [{ pausedAt: 2000, resumedAt: 3000 }];
    expect(toMediaTime(4000, 1000, pauses)).toBe(2000);
  });

  it('maps an instant inside a pause to the moment the pause began', () => {
    const pauses = [{ pausedAt: 2000, resumedAt: 3000 }];
    expect(toMediaTime(2500, 1000, pauses)).toBe(1000);
    expect(toMediaTime(3000, 1000, pauses)).toBe(1000);
    expect(toMediaTime(3200, 1000, pauses)).toBe(1200);
  });

  it('treats an open pause as lasting forever', () => {
    const pauses = [{ pausedAt: 2000, resumedAt: null }];
    expect(toMediaTime(9_000_000, 1000, pauses)).toBe(1000);
  });

  it('is monotonic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        partsArb,
        fc.integer({ min: 0, max: 80_000 }),
        fc.integer({ min: 0, max: 80_000 }),
        (start, parts, a, b) => {
          const pauses = pausesFrom(start, parts);
          const [early, late] = a <= b ? [a, b] : [b, a];
          expect(toMediaTime(early, start, pauses)).toBeLessThanOrEqual(
            toMediaTime(late, start, pauses),
          );
        },
      ),
    );
  });

  it('maps every instant inside a pause to the pause start', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        partsArb.filter((parts) => parts.length > 0),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (start, parts, fraction) => {
          const pauses = pausesFrom(start, parts);
          for (const pause of pauses) {
            if (pause.resumedAt === null) continue;
            const inside = pause.pausedAt + (pause.resumedAt - pause.pausedAt) * fraction;
            expect(toMediaTime(inside, start, pauses)).toBe(
              toMediaTime(pause.pausedAt, start, pauses),
            );
          }
        },
      ),
    );
  });

  it('gives a media duration of wall time minus paused time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        partsArb,
        fc.integer({ min: 0, max: 5000 }),
        (start, parts, tail) => {
          const pauses = pausesFrom(start, parts);
          const last = pauses.at(-1)?.resumedAt ?? start;
          const end = last + tail;
          const pausedTotal = parts.reduce((sum, [, length]) => sum + length, 0);
          expect(toMediaTime(end, start, pauses)).toBe(end - start - pausedTotal);
        },
      ),
    );
  });
});

describe('isPaused', () => {
  const pauses = [
    { pausedAt: 100, resumedAt: 200 },
    { pausedAt: 300, resumedAt: null },
  ];
  it('is true strictly inside a pause and false at the edges and between', () => {
    expect(isPaused(100, pauses)).toBe(false);
    expect(isPaused(150, pauses)).toBe(true);
    expect(isPaused(200, pauses)).toBe(false);
    expect(isPaused(250, pauses)).toBe(false);
    expect(isPaused(301, pauses)).toBe(true);
    expect(isPaused(9e9, pauses)).toBe(true);
  });
});

describe('validatePauses', () => {
  it('accepts no pauses, ordered pauses and a trailing open pause', () => {
    expect(validatePauses([]).ok).toBe(true);
    expect(
      validatePauses(
        [
          { pausedAt: 10, resumedAt: 20 },
          { pausedAt: 20, resumedAt: 30 },
          { pausedAt: 40, resumedAt: null },
        ],
        0,
      ).ok,
    ).toBe(true);
  });

  it.each([
    ['not finite', [{ pausedAt: Number.NaN, resumedAt: 1 }], undefined, 'not-finite'],
    ['not finite resume', [{ pausedAt: 1, resumedAt: Infinity }], undefined, 'not-finite'],
    ['before the start', [{ pausedAt: 5, resumedAt: 9 }], 10, 'before-start'],
    ['resume before pause', [{ pausedAt: 9, resumedAt: 5 }], undefined, 'resume-before-pause'],
    [
      'overlap',
      [
        { pausedAt: 10, resumedAt: 30 },
        { pausedAt: 20, resumedAt: 40 },
      ],
      undefined,
      'overlap',
    ],
    [
      'an open pause that is not last',
      [
        { pausedAt: 10, resumedAt: null },
        { pausedAt: 20, resumedAt: 30 },
      ],
      undefined,
      'open-pause-not-last',
    ],
  ] as const)('rejects %s', (_label, pauses, start, code) => {
    const result = validatePauses(pauses, start);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('accepts every generated valid sequence', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), partsArb, (start, parts) => {
        expect(validatePauses(pausesFrom(start, parts), start).ok).toBe(true);
      }),
    );
  });
});

describe('recorder phase reducer', () => {
  const walk = (events: RecorderEvent[]): RecorderPhase => {
    let phase: RecorderPhase = 'idle';
    for (const event of events) {
      const result = nextPhase(phase, event);
      if (!result.ok) throw new Error(`${phase} cannot ${event}`);
      phase = result.value;
    }
    return phase;
  };

  it('follows the normal life of a recording', () => {
    expect(walk(['start', 'started'])).toBe('recording');
    expect(walk(['start', 'started', 'pause'])).toBe('paused');
    expect(walk(['start', 'started', 'pause', 'resume', 'stop', 'stopped'])).toBe('stopped');
    expect(walk(['start', 'started', 'stop', 'stopped', 'reset'])).toBe('idle');
  });

  it('can fail from every active phase and then reset', () => {
    const lives: RecorderEvent[][] = [
      ['start'],
      ['start', 'started'],
      ['start', 'started', 'pause'],
      ['start', 'started', 'stop'],
    ];
    for (const events of lives) {
      expect(walk([...events, 'fail'])).toBe('failed');
      expect(walk([...events, 'fail', 'reset'])).toBe('idle');
    }
  });

  it('returns an error value for a transition that makes no sense', () => {
    expect(nextPhase('idle', 'pause')).toEqual({
      ok: false,
      error: { code: 'invalid-transition', from: 'idle', event: 'pause' },
    });
    expect(nextPhase('stopped', 'start').ok).toBe(false);
    expect(nextPhase('recording', 'resume').ok).toBe(false);
    expect(nextPhase('failed', 'stop').ok).toBe(false);
  });

  it('never throws, whatever the sequence', () => {
    const events: RecorderEvent[] = [
      'start',
      'started',
      'pause',
      'resume',
      'stop',
      'stopped',
      'fail',
      'reset',
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...events), { maxLength: 30 }), (sequence) => {
        let phase: RecorderPhase = 'idle';
        for (const event of sequence) {
          const result = nextPhase(phase, event);
          if (result.ok) phase = result.value;
        }
        expect(typeof phase).toBe('string');
      }),
    );
  });

  it('knows which phases are active', () => {
    expect(isActive('recording')).toBe(true);
    expect(isActive('paused')).toBe(true);
    expect(isActive('idle')).toBe(false);
    expect(isActive('stopped')).toBe(false);
    expect(isActive('failed')).toBe(false);
  });
});
