import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isOffAt, offIntervals, sessionFileSchema, type ToggleEntry } from '../src';

const base = {
  version: 1,
  id: '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11',
  name: 'Demo',
  createdAt: '2026-10-26T12:00:00.000Z',
  app: { version: '0.0.0', os: 'windows', arch: 'x64' },
  pid: 4242,
  source: { kind: 'display', displayId: '1', origin: { x: 0, y: 0 }, scaleFactor: 1 },
  capture: { cursorInCapture: true },
  tracks: [],
  clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
  pauses: [],
  input: { status: 'recorded', file: 'input.ndjson' },
  warnings: [],
  heartbeatAt: '2026-10-26T12:00:02.000Z',
  heartbeatElapsedMs: 2000,
  cleanClose: true,
};

describe('session toggles field', () => {
  it('loads an old session that has no toggles', () => {
    const parsed = sessionFileSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.toggles).toBeUndefined();
  });

  it('loads a session with toggles', () => {
    const toggles = [
      { kind: 'mic', on: false, t: 1200 },
      { kind: 'mic', on: true, t: 3400 },
      { kind: 'camera', on: false, t: 0 },
    ];
    const parsed = sessionFileSchema.safeParse({ ...base, toggles });
    expect(parsed.success && parsed.data.toggles).toEqual(toggles);
  });

  it.each([
    ['an unknown kind', [{ kind: 'screen', on: false, t: 1 }]],
    ['a negative time', [{ kind: 'mic', on: false, t: -1 }]],
    ['a missing state', [{ kind: 'mic', t: 1 }]],
    ['a stray field', [{ kind: 'mic', on: false, t: 1, why: 'x' }]],
  ])('rejects %s', (_name, toggles) => {
    expect(sessionFileSchema.safeParse({ ...base, toggles }).success).toBe(false);
  });
});

const entry = (kind: 'mic' | 'camera', on: boolean, t: number): ToggleEntry => ({ kind, on, t });

describe('offIntervals', () => {
  it('is empty without a log', () => {
    expect(offIntervals(undefined, 'mic')).toEqual([]);
    expect(offIntervals([], 'camera')).toEqual([]);
  });

  it('pairs an off with the next on, per device', () => {
    const log = [
      entry('mic', false, 1000),
      entry('camera', false, 1500),
      entry('mic', true, 2000),
      entry('camera', true, 4000),
    ];
    expect(offIntervals(log, 'mic')).toEqual([{ fromMs: 1000, toMs: 2000 }]);
    expect(offIntervals(log, 'camera')).toEqual([{ fromMs: 1500, toMs: 4000 }]);
  });

  it('keeps an open interval to the end', () => {
    expect(offIntervals([entry('mic', false, 500)], 'mic')).toEqual([
      { fromMs: 500, toMs: Infinity },
    ]);
  });

  it('ignores repeats of the state a device already has', () => {
    const log = [
      entry('mic', true, 10),
      entry('mic', false, 100),
      entry('mic', false, 150),
      entry('mic', true, 200),
      entry('mic', true, 250),
    ];
    expect(offIntervals(log, 'mic')).toEqual([{ fromMs: 100, toMs: 200 }]);
  });

  it('reads entries in time order even when the log is shuffled', () => {
    const log = [entry('mic', true, 200), entry('mic', false, 100)];
    expect(offIntervals(log, 'mic')).toEqual([{ fromMs: 100, toMs: 200 }]);
  });

  it('drops an off that is undone at the same instant', () => {
    expect(offIntervals([entry('mic', false, 100), entry('mic', true, 100)], 'mic')).toEqual([]);
  });

  it('answers isOffAt with half open intervals', () => {
    const intervals = offIntervals([entry('mic', false, 100), entry('mic', true, 200)], 'mic');
    expect(isOffAt(intervals, 99)).toBe(false);
    expect(isOffAt(intervals, 100)).toBe(true);
    expect(isOffAt(intervals, 199.9)).toBe(true);
    expect(isOffAt(intervals, 200)).toBe(false);
  });

  it('always returns ordered, non overlapping intervals', () => {
    const entries = fc.array(
      fc.record({
        kind: fc.constantFrom('mic' as const, 'camera' as const),
        on: fc.boolean(),
        t: fc.integer({ min: 0, max: 10_000 }),
      }),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(entries, (log) => {
        for (const kind of ['mic', 'camera'] as const) {
          const intervals = offIntervals(log, kind);
          let end = -1;
          for (const interval of intervals) {
            expect(interval.toMs).toBeGreaterThan(interval.fromMs);
            expect(interval.fromMs).toBeGreaterThanOrEqual(end);
            end = interval.toMs;
          }
        }
      }),
    );
  });
});
