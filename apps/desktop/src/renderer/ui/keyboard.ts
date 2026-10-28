/** The index an arrow key moves to, wrapping at both ends and skipping disabled entries. */
export function nextEnabledIndex(
  disabled: readonly boolean[],
  from: number,
  direction: 1 | -1,
): number {
  const count = disabled.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (((from + direction * step) % count) + count) % count;
    if (!disabled[index]) return index;
  }
  return from;
}

/** Left and up go back, right and down go forward, as in a native radio group. */
export function arrowDirection(key: string): 1 | -1 | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  return null;
}

/**
 * Where typing a letter jumps to in a list. A buffer of several letters narrows the match on the
 * first one (`s`, `st`), and one letter pressed again cycles through the entries that start with it.
 * Returns null when nothing matches.
 */
export function typeaheadIndex(
  labels: readonly string[],
  disabled: readonly boolean[],
  current: number,
  buffer: string,
): number | null {
  const needle = buffer.toLowerCase();
  if (needle === '') return null;
  const cycling = Array.from(needle).every((char) => char === needle.charAt(0));
  const prefix = cycling ? needle[0] : needle;
  if (prefix === undefined) return null;
  const count = labels.length;
  // One repeated letter moves on from the current entry. Longer text may keep the current one.
  const first = cycling ? 1 : 0;
  for (let step = first; step < count + first; step += 1) {
    const index = (((current + step) % count) + count) % count;
    if (!disabled[index] && (labels[index] ?? '').toLowerCase().startsWith(prefix)) return index;
  }
  return null;
}
