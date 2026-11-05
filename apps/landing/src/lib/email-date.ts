/** The owner's time zone, used for the note that tells the owner about a download. */
export const OWNER_TIME_ZONE = 'Africa/Lagos';

const FALLBACK_TIME_ZONE = 'UTC';
const ZONE_SHAPE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

let known: ReadonlySet<string> | undefined;

function knownZones(): ReadonlySet<string> {
  known ??= new Set<string>(
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [],
  );
  return known;
}

/**
 * A time zone name that is safe to use, or UTC. The visitor's browser sends its own zone and it is
 * checked against the system's list of real zones, so a made up or oversized value is never used.
 * Older names such as Asia/Calcutta are not in the list but are still real, so a name of the right
 * shape that the system accepts also passes.
 */
export function resolveTimeZone(input: string | null | undefined): string {
  if (input === undefined || input === null || input.length === 0 || input.length > 64) {
    return FALLBACK_TIME_ZONE;
  }
  if (input === FALLBACK_TIME_ZONE || knownZones().has(input)) {
    return input;
  }
  if (!ZONE_SHAPE.test(input)) {
    return FALLBACK_TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input });
    return input;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/** "Lagos time" for Africa/Lagos, "New York time" for America/New_York, "UTC" for UTC. */
function zoneLabel(timeZone: string): string {
  if (timeZone === FALLBACK_TIME_ZONE) {
    return 'UTC';
  }
  const city = (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ');
  return `${city} time`;
}

/**
 * A date for people in an email, in a 12 hour clock with the zone named, for example
 * "Thursday, November 5, 2026 at 4:29 AM (Lagos time)". An unusable zone becomes UTC.
 */
export function formatEmailDate(date: Date, timeZone: string | null | undefined): string {
  const zone = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const period = pick('dayPeriod').toUpperCase();
  return (
    `${pick('weekday')}, ${pick('month')} ${pick('day')}, ${pick('year')} at ` +
    `${pick('hour')}:${pick('minute')} ${period} (${zoneLabel(zone)})`
  );
}
