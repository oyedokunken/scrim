import type { LibraryItem } from '../../../shared/library-contract';

export type LibraryFilter = 'all' | 'recording' | 'screenshot';
export type LibraryOrder = 'newest' | 'oldest';

interface LibraryViewState {
  filter: LibraryFilter;
  query: string;
  order: LibraryOrder;
}

/** What to show: the chosen kind, names that contain the search text (any case), in date order. */
export function visibleItems(items: readonly LibraryItem[], view: LibraryViewState): LibraryItem[] {
  const needle = view.query.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      (view.filter === 'all' || item.kind === view.filter) &&
      (needle === '' || item.name.toLowerCase().includes(needle)),
  );
  const sign = view.order === 'newest' ? -1 : 1;
  return [...shown].sort((a, b) => sign * (a.createdMs - b.createdMs));
}

/** The line under a card's name: how long a recording is, or the word Screenshot. */
export function itemKindLabel(item: LibraryItem): string {
  if (item.kind === 'screenshot') return 'Screenshot';
  if (item.durationMs === null) return 'Recording';
  const total = Math.round(item.durationMs / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number): string => String(value).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${two(minutes)}:${two(seconds)}`
    : `${String(minutes)}:${two(seconds)}`;
}

/** What the empty state says: nothing at all yet, or nothing that matches the filter and search. */
export function emptyReason(
  total: number,
  shown: number,
): 'nothing-yet' | 'no-match' | 'has-items' {
  if (total === 0) return 'nothing-yet';
  return shown === 0 ? 'no-match' : 'has-items';
}

/** A key that stays the same when a listing is read again, so a thumbnail is not cut twice. */
export function thumbKey(item: LibraryItem): string {
  return `${item.kind}|${item.name}|${String(item.createdMs)}|${String(item.bytes)}`;
}

export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Anything made in the last 24 hours gets the NEW pill. A clock set back never hides it. */
export function isNew(item: LibraryItem, nowMs: number): boolean {
  return nowMs - item.createdMs < NEW_WINDOW_MS;
}

/** The file name as it is on disk: the name plus .png or .mp4. A recording without a file has only its name. */
export function fullFileName(item: LibraryItem): string {
  if (!item.isFile) return item.name;
  return `${item.name}${item.kind === 'screenshot' ? '.png' : '.mp4'}`;
}
