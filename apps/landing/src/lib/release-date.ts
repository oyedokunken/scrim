/** What the page needs to say about the latest release. */
export interface ReleaseSummary {
  version: string;
  url: string;
  publishedAt: string | null;
}

const FORMAT = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * A release date for people to read, such as "2 November 2026". The date is in UTC so the server
 * and every visitor see the same day. It returns null for a missing or unreadable date.
 */
export function formatReleaseDate(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : FORMAT.format(date);
}
