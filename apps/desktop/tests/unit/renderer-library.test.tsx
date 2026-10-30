import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  cardFacts,
  emptyReason,
  fullFileName,
  isNew,
  NEW_WINDOW_MS,
  itemKindLabel,
  thumbKey,
  visibleItems,
} from '../../src/renderer/src/library/library-model';
import { Menu } from '../../src/renderer/ui/menu';
import { libraryContract } from '../../src/shared/library-contract';
import type { LibraryItem } from '../../src/shared/library-contract';

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: 'x',
  kind: 'recording',
  name: 'Demo',
  createdMs: 1000,
  durationMs: 65_000,
  bytes: 10,
  width: null,
  height: null,
  tracks: ['screen'],
  folder: 'C:\\Videos\\Scrim',
  canEdit: true,
  hasVideo: true,
  isFile: true,
  ...over,
});

const ITEMS = [
  item({ id: 'a', name: 'Pricing demo', createdMs: 3000 }),
  item({ id: 'b', kind: 'screenshot', name: 'Pricing page', createdMs: 2000, durationMs: null }),
  item({ id: 'c', name: 'Onboarding', createdMs: 1000 }),
];

describe('visibleItems', () => {
  const all = { filter: 'all', query: '', order: 'newest' } as const;

  it('sorts by date, newest or oldest first', () => {
    expect(visibleItems(ITEMS, all).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(visibleItems(ITEMS, { ...all, order: 'oldest' }).map((entry) => entry.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('filters by kind', () => {
    expect(visibleItems(ITEMS, { ...all, filter: 'recording' }).map((entry) => entry.id)).toEqual([
      'a',
      'c',
    ]);
    expect(visibleItems(ITEMS, { ...all, filter: 'screenshot' }).map((entry) => entry.id)).toEqual([
      'b',
    ]);
  });

  it('searches names in any case and ignores spaces around the text', () => {
    expect(visibleItems(ITEMS, { ...all, query: '  PRICING ' }).map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(visibleItems(ITEMS, { ...all, query: 'zzz' })).toEqual([]);
  });

  it('combines the filter and the search, and leaves the input alone', () => {
    const copy = [...ITEMS];
    expect(
      visibleItems(ITEMS, { filter: 'screenshot', query: 'pricing', order: 'newest' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['b']);
    expect(ITEMS).toEqual(copy);
  });
});

describe('itemKindLabel', () => {
  it('says Screenshot, or the length of a recording', () => {
    expect(itemKindLabel(item({ kind: 'screenshot', durationMs: null }))).toBe('Screenshot');
    expect(itemKindLabel(item({ durationMs: 65_000 }))).toBe('1:05');
    expect(itemKindLabel(item({ durationMs: 3_725_000 }))).toBe('1:02:05');
    expect(itemKindLabel(item({ durationMs: null }))).toBe('Recording');
  });
});

describe('emptyReason', () => {
  it('tells apart nothing yet, no match and some', () => {
    expect(emptyReason(0, 0)).toBe('nothing-yet');
    expect(emptyReason(3, 0)).toBe('no-match');
    expect(emptyReason(3, 2)).toBe('has-items');
  });
});

describe('thumbKey', () => {
  it('stays the same across listings and changes when the file changes', () => {
    expect(thumbKey(item({ id: 'one' }))).toBe(thumbKey(item({ id: 'two' })));
    expect(thumbKey(item({ bytes: 11 }))).not.toBe(thumbKey(item({})));
  });
});

describe('the menu', () => {
  const html = renderToStaticMarkup(
    <Menu
      label="More for Demo"
      items={[
        { key: 'rename', label: 'Rename', onSelect: vi.fn() },
        { key: 'delete', label: 'Delete', danger: true, onSelect: vi.fn() },
      ]}
    />,
  );

  it('is a named button that opens a menu with every action', () => {
    expect(html).toContain('aria-label="More for Demo"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('role="menu"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it('marks the dangerous action', () => {
    expect(html).toMatch(/menu-item danger[^>]*>.*Delete/s);
  });
});

describe('the library contract', () => {
  it('names items by id and takes no path', () => {
    expect(libraryContract['library:open'].input.safeParse({ id: 'abc' }).success).toBe(true);
    expect(
      libraryContract['library:open'].input.safeParse({ id: 'abc', path: 'C:\\x' }).success,
    ).toBe(false);
    expect(libraryContract['library:delete'].input.safeParse({ path: 'C:\\x' }).success).toBe(
      false,
    );
  });

  it('limits a new name to a plain length', () => {
    const { input } = libraryContract['library:rename'];
    expect(input.safeParse({ id: 'a', name: 'ok' }).success).toBe(true);
    expect(input.safeParse({ id: 'a', name: '' }).success).toBe(false);
    expect(input.safeParse({ id: 'a', name: 'x'.repeat(121) }).success).toBe(false);
  });
});

describe('isNew', () => {
  it('marks anything made in the last 24 hours', () => {
    const now = 10 * NEW_WINDOW_MS;
    expect(isNew(item({ createdMs: now - 1000 }), now)).toBe(true);
    expect(isNew(item({ createdMs: now - NEW_WINDOW_MS + 1 }), now)).toBe(true);
    expect(isNew(item({ createdMs: now - NEW_WINDOW_MS }), now)).toBe(false);
    expect(isNew(item({ createdMs: now + 5000 }), now)).toBe(true);
  });
});

describe('fullFileName', () => {
  it('adds the extension of the file on disk', () => {
    expect(fullFileName(item({ name: 'Take 1' }))).toBe('Take 1.mp4');
    expect(fullFileName(item({ kind: 'screenshot', name: 'Shot' }))).toBe('Shot.png');
    expect(fullFileName(item({ name: 'Take 2', isFile: false }))).toBe('Take 2');
  });
});

describe('cardFacts', () => {
  const now = Date.parse('2026-10-30T12:00:00');

  it('gives size, length and the date for a recording', () => {
    const facts = cardFacts(
      item({ bytes: 2048, durationMs: 65_000, createdMs: Date.parse('2026-10-30T09:05:00') }),
      now,
    );
    expect(facts).toEqual(['2.0 KB', '1:05', 'Today 09:05']);
  });

  it('gives pixels and the date for a screenshot, and leaves out an unknown size', () => {
    const shot = item({
      kind: 'screenshot',
      durationMs: null,
      bytes: 0,
      width: 800,
      height: 600,
      createdMs: Date.parse('2026-10-29T10:00:00'),
    });
    expect(cardFacts(shot, now)).toEqual(['800 by 600', 'Yesterday 10:00']);
  });
});
