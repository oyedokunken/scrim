import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIN_MOMENT_MS,
  addMoment,
  deleteMoment,
  momentKind,
  moveMoment,
  resizeMoment,
  sameMoments,
  tidyMoments,
  type ZoomMoment,
} from '../src/entry-zoom';
import { zoomEditsSchema } from '../src/index';

const DURATION = 20_000;
const m = (startMs: number, endMs: number, x = 100, y = 100): ZoomMoment => ({
  startMs,
  endMs,
  x,
  y,
});
const list = [m(1000, 3000), m(6000, 8000), m(12_000, 14_000)];

describe('deleteMoment', () => {
  it('removes one and leaves the rest alone', () => {
    expect(deleteMoment(list, 1)).toEqual([m(1000, 3000), m(12_000, 14_000)]);
    expect(deleteMoment(list, 9)).toEqual(list);
  });

  it('does not change the list it was given', () => {
    const snapshot = structuredClone(list);
    deleteMoment(list, 0);
    expect(list).toEqual(snapshot);
  });
});

describe('moveMoment', () => {
  it('slides a moment and keeps its length', () => {
    const moved = moveMoment(list, 1, 1500, DURATION);
    expect(moved[1]).toEqual(m(7500, 9500));
  });

  it('stops at the neighbours and at the ends', () => {
    expect(moveMoment(list, 1, 99_000, DURATION)[1]).toEqual(m(10_000, 12_000));
    expect(moveMoment(list, 1, -99_000, DURATION)[1]).toEqual(m(3000, 5000));
    expect(moveMoment(list, 0, -99_000, DURATION)[0]).toEqual(m(0, 2000));
    expect(moveMoment(list, 2, 99_000, DURATION)[2]).toEqual(m(18_000, 20_000));
  });

  it('ignores an index that is not there', () => {
    expect(moveMoment(list, 7, 100, DURATION)).toEqual(list);
  });
});

describe('resizeMoment', () => {
  it('extends the hold by dragging the end', () => {
    expect(resizeMoment(list, 0, 'end', 4500, DURATION)[0]).toEqual(m(1000, 4500));
  });

  it('starts the zoom earlier by dragging the start', () => {
    expect(resizeMoment(list, 1, 'start', 5000, DURATION)[1]).toEqual(m(5000, 8000));
  });

  it('keeps the minimum length', () => {
    expect(resizeMoment(list, 0, 'end', 1000, DURATION)[0]?.endMs).toBe(1000 + MIN_MOMENT_MS);
    expect(resizeMoment(list, 0, 'start', 99_000, DURATION)[0]?.startMs).toBe(3000 - MIN_MOMENT_MS);
  });

  it('stops at the neighbours', () => {
    expect(resizeMoment(list, 0, 'end', 99_000, DURATION)[0]?.endMs).toBe(6000);
    expect(resizeMoment(list, 1, 'start', 0, DURATION)[1]?.startMs).toBe(3000);
    expect(resizeMoment(list, 2, 'end', 99_000, DURATION)[2]?.endMs).toBe(DURATION);
  });

  it('ignores an index that is not there', () => {
    expect(resizeMoment(list, -1, 'end', 100, DURATION)).toEqual(list);
  });
});

describe('addMoment', () => {
  it('adds a moment at the playhead, in order, aimed at the focus', () => {
    const result = addMoment(list, 4000, { x: 50, y: 60 }, 2000, DURATION);
    expect(result.added).toBe(true);
    expect(result.index).toBe(1);
    expect(result.moments[1]).toEqual(m(4000, 6000, 50, 60));
  });

  it('shortens the new moment to fit before the next one', () => {
    const result = addMoment(list, 4500, { x: 1, y: 1 }, 4000, DURATION);
    expect(result.moments[result.index]).toEqual(m(4500, 6000, 1, 1));
  });

  it('refuses inside a moment and when there is no room', () => {
    expect(addMoment(list, 2000, { x: 1, y: 1 }, 2000, DURATION).added).toBe(false);
    expect(addMoment(list, 5700, { x: 1, y: 1 }, 2000, DURATION).added).toBe(false);
    expect(addMoment(list, DURATION - 100, { x: 1, y: 1 }, 2000, DURATION).added).toBe(false);
  });

  it('adds to an empty list', () => {
    expect(addMoment([], 1000, { x: 5, y: 5 }, 1500, DURATION).moments).toEqual([
      m(1000, 2500, 5, 5),
    ]);
  });
});

describe('tidyMoments', () => {
  it('sorts, joins overlaps, clips to the recording and drops slivers', () => {
    const tidy = tidyMoments([m(9000, 30_000), m(100, 200), m(500, 2000), m(1500, 2600)], DURATION);
    expect(tidy).toEqual([m(500, 2600), m(9000, DURATION)]);
  });
});

describe('sameMoments and momentKind', () => {
  it('compares lists to within a millisecond', () => {
    expect(sameMoments(list, structuredClone(list))).toBe(true);
    expect(sameMoments(list, [m(1000.4, 3000), m(6000, 8000), m(12_000, 14_000)])).toBe(true);
    expect(sameMoments(list, list.slice(1))).toBe(false);
    expect(sameMoments(list, [m(1000, 3500), m(6000, 8000), m(12_000, 14_000)])).toBe(false);
  });

  it('calls a moment with a click inside it a click, and the rest added', () => {
    expect(momentKind(m(1000, 3000), [2000])).toBe('click');
    expect(momentKind(m(1000, 3000), [5000])).toBe('added');
  });
});

describe('edit properties', () => {
  const momentsArb = fc
    .array(fc.tuple(fc.integer({ min: 0, max: 18_000 }), fc.integer({ min: 600, max: 4000 })), {
      maxLength: 8,
    })
    .map((pairs) =>
      tidyMoments(
        pairs.map(([s, l]) => m(s, s + l)),
        DURATION,
      ),
    );

  const valid = (moments: readonly ZoomMoment[]): void => {
    let previousEnd = 0;
    for (const moment of moments) {
      expect(moment.startMs).toBeGreaterThanOrEqual(previousEnd);
      expect(moment.endMs - moment.startMs).toBeGreaterThanOrEqual(MIN_MOMENT_MS - 1e-6);
      expect(moment.endMs).toBeLessThanOrEqual(DURATION);
      previousEnd = moment.endMs;
    }
  };

  it('every edit leaves a sorted list with no overlaps and no short moments', () => {
    fc.assert(
      fc.property(
        momentsArb,
        fc.nat(8),
        fc.integer({ min: -30_000, max: 30_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.constantFrom('start' as const, 'end' as const),
        (moments, index, delta, at, edge) => {
          valid(moments);
          valid(moveMoment(moments, index, delta, DURATION));
          valid(resizeMoment(moments, index, edge, at, DURATION));
          valid(deleteMoment(moments, index));
          valid(addMoment(moments, at, { x: 0, y: 0 }, 1500, DURATION).moments);
        },
      ),
    );
  });
});

describe('zoomEditsSchema', () => {
  it('accepts a list, including an empty one, and rejects strays and backwards moments', () => {
    expect(zoomEditsSchema.safeParse({ moments: [] }).success).toBe(true);
    expect(zoomEditsSchema.safeParse({ moments: [m(1, 2000)] }).success).toBe(true);
    expect(zoomEditsSchema.safeParse({ moments: [m(2000, 1000)] }).success).toBe(false);
    expect(zoomEditsSchema.safeParse({ moments: [], extra: 1 }).success).toBe(false);
    expect(zoomEditsSchema.safeParse({ moments: [{ ...m(1, 2000), z: 1 }] }).success).toBe(false);
  });
});
