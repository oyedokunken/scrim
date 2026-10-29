import { describe, expect, it } from 'vitest';
import { checkEditList, editListSchema, emptyEditList } from '../src';

describe('editListSchema', () => {
  it('accepts the empty list and a list with a trim and cuts', () => {
    expect(editListSchema.safeParse(emptyEditList()).success).toBe(true);
    expect(
      editListSchema.safeParse({
        version: 1,
        trim: { startMs: 500, endMs: 9000 },
        cuts: [{ startMs: 1000, endMs: 2000 }],
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a wrong version', { version: 2, trim: null, cuts: [] }],
    ['a missing trim', { version: 1, cuts: [] }],
    ['a span that ends before it starts', { version: 1, trim: { startMs: 5, endMs: 5 }, cuts: [] }],
    ['a negative start', { version: 1, trim: null, cuts: [{ startMs: -1, endMs: 5 }] }],
    ['an unknown field', { version: 1, trim: null, cuts: [], extra: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(editListSchema.safeParse(value).success).toBe(false);
  });

  it('makes a fresh empty list each time, so nobody shares one', () => {
    expect(emptyEditList()).toEqual({ version: 1, trim: null, cuts: [] });
    expect(emptyEditList()).not.toBe(emptyEditList());
  });
});

describe('checkEditList', () => {
  const list = (cuts: [number, number][], trim: [number, number] | null = null) => ({
    version: 1 as const,
    trim: trim === null ? null : { startMs: trim[0], endMs: trim[1] },
    cuts: cuts.map(([startMs, endMs]) => ({ startMs, endMs })),
  });

  it('finds nothing wrong with an empty list or well formed cuts', () => {
    expect(checkEditList(emptyEditList(), 10_000)).toEqual([]);
    expect(
      checkEditList(
        list([
          [100, 200],
          [200, 300],
          [500, 900],
        ]),
        10_000,
      ),
    ).toEqual([]);
  });

  it('reports overlapping cuts', () => {
    expect(
      checkEditList(
        list([
          [100, 400],
          [300, 500],
        ]),
        10_000,
      ),
    ).toEqual([{ code: 'cuts-overlap', index: 1 }]);
  });

  it('reports a cut past the end of the recording or outside the trim', () => {
    expect(checkEditList(list([[9000, 11_000]]), 10_000)).toEqual([{ code: 'past-end', index: 0 }]);
    expect(checkEditList(list([[100, 200]], [500, 9000]), 10_000)).toEqual([
      { code: 'past-end', index: 0 },
    ]);
  });
});

describe('editListSchema zoom moments', () => {
  it('keeps edited zoom moments and treats a missing list as planner decides', () => {
    const withZoom = {
      ...emptyEditList(),
      zoom: { moments: [{ startMs: 100, endMs: 900, x: 300, y: 200 }] },
    };
    expect(editListSchema.parse(withZoom).zoom?.moments).toHaveLength(1);
    expect(editListSchema.parse(emptyEditList()).zoom).toBeUndefined();
    expect(
      editListSchema.parse({ ...emptyEditList(), zoom: { moments: [] } }).zoom?.moments,
    ).toEqual([]);
  });

  it('rejects a moment that ends before it starts', () => {
    const bad = {
      ...emptyEditList(),
      zoom: { moments: [{ startMs: 900, endMs: 100, x: 0, y: 0 }] },
    };
    expect(editListSchema.safeParse(bad).success).toBe(false);
  });
});
