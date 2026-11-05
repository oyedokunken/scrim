import { describe, expect, it } from 'vitest';
import { formatEmailDate, OWNER_TIME_ZONE, resolveTimeZone } from '@/lib/email-date';

// 3:29 AM UTC on 5 November 2026.
const MOMENT = new Date('2026-11-05T03:29:00Z');

describe('formatEmailDate', () => {
  it('writes the owner time in Lagos on a 12 hour clock', () => {
    expect(formatEmailDate(MOMENT, OWNER_TIME_ZONE)).toBe(
      'Thursday, November 5, 2026 at 4:29 AM (Lagos time)',
    );
  });

  it("writes a visitor's own zone, which can be on the day before", () => {
    expect(formatEmailDate(MOMENT, 'America/New_York')).toBe(
      'Wednesday, November 4, 2026 at 10:29 PM (New York time)',
    );
  });

  it('uses PM for the afternoon and 12 for noon', () => {
    expect(formatEmailDate(new Date('2026-11-05T12:05:00Z'), 'UTC')).toBe(
      'Thursday, November 5, 2026 at 12:05 PM (UTC)',
    );
    expect(formatEmailDate(new Date('2026-11-05T15:30:00Z'), 'UTC')).toContain('3:30 PM');
  });

  it('falls back to UTC with the same format when the zone is missing or wrong', () => {
    const expected = 'Thursday, November 5, 2026 at 3:29 AM (UTC)';
    expect(formatEmailDate(MOMENT, undefined)).toBe(expected);
    expect(formatEmailDate(MOMENT, null)).toBe(expected);
    expect(formatEmailDate(MOMENT, 'Mars/Olympus_Mons')).toBe(expected);
  });

  it('never shows the ISO style date it replaces', () => {
    expect(formatEmailDate(MOMENT, 'UTC')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('resolveTimeZone', () => {
  it.each(['Africa/Lagos', 'America/New_York', 'Europe/London', 'UTC', 'Asia/Calcutta'])(
    'accepts %s',
    (zone) => {
      expect(resolveTimeZone(zone)).toBe(zone);
    },
  );

  it.each([
    '',
    'not a zone',
    'Mars/Olympus_Mons',
    '../../etc/passwd',
    '<script>alert(1)</script>',
    `Europe/${'A'.repeat(80)}`,
  ])('turns %j into UTC', (zone) => {
    expect(resolveTimeZone(zone)).toBe('UTC');
  });

  it('turns a missing value into UTC', () => {
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(resolveTimeZone(null)).toBe('UTC');
  });
});
