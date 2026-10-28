import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatClock, scrollProgress } from '@/lib/clock';

describe('formatClock', () => {
  it('formats minutes and seconds with leading zeros', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(8000)).toBe('00:08');
    expect(formatClock(59_999)).toBe('00:59');
    expect(formatClock(60_000)).toBe('01:00');
    expect(formatClock(754_000)).toBe('12:34');
  });

  it('never shows a negative time', () => {
    expect(formatClock(-1)).toBe('00:00');
  });
});

describe('scrollProgress', () => {
  it('runs from 0 at the top to 1 at the bottom', () => {
    expect(scrollProgress(0, 4000)).toBe(0);
    expect(scrollProgress(2000, 4000)).toBe(0.5);
    expect(scrollProgress(4000, 4000)).toBe(1);
  });

  it('stays between 0 and 1 even when the page overscrolls', () => {
    expect(scrollProgress(-100, 4000)).toBe(0);
    expect(scrollProgress(4300, 4000)).toBe(1);
  });

  it('is 0 for a page that does not scroll', () => {
    expect(scrollProgress(0, 0)).toBe(0);
    expect(scrollProgress(50, -10)).toBe(0);
  });

  it('is always within the range for any input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5000, max: 100_000 }),
        fc.integer({ min: -100, max: 100_000 }),
        (y, max) => {
          const progress = scrollProgress(y, max);
          expect(progress).toBeGreaterThanOrEqual(0);
          expect(progress).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
