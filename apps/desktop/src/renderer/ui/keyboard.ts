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
