/** A recording clock, as minutes and seconds: 7000 becomes 00:07. */
export function formatClock(timeMs: number): string {
  const total = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * How far down the page the visitor is, from 0 at the top to 1 at the bottom. A page that does
 * not scroll is at 0.
 */
export function scrollProgress(scrollY: number, scrollable: number): number {
  if (scrollable <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, scrollY / scrollable));
}
