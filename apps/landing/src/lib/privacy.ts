/** When the privacy policy last changed. Update this one value and the page follows. */
export const PRIVACY_LAST_UPDATED = '2026-10-26';

/**
 * How long download records are kept. The owner has not set a period yet, so this says so in
 * plain words instead of inventing one. Replace it with a real period when one is chosen.
 */
export const RETENTION_STATEMENT =
  'We keep download records only as long as we need them to count downloads and send release notices. You can ask us to delete yours at any time.';

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

/** The last updated date for people to read, such as "26 October 2026". */
export function formatPrivacyDate(iso: string = PRIVACY_LAST_UPDATED): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Expected an ISO date such as 2026-10-26, received "${iso}".`);
  }
  return DATE.format(date);
}
