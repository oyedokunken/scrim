const pad = (value: number): string => String(value).padStart(2, '0');

/** A recording clock: 7000 becomes 00:07, and an hour or more becomes 1:02:03. */
export function formatTimer(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** A size in plain units, for the summary of a finished recording. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit] ?? 'TB'}`;
}

/** Seconds with one decimal for the hold setting, such as 1.2 s. */
export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };

/** "2026-10-28" as "October 28, 2026" in the person's language. Anything else is shown as it came. */
export function formatDay(day: string, locale?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return day;
  const [, year, month, date] = match;
  const when = new Date(Number(year), Number(month) - 1, Number(date));
  return Number.isNaN(when.getTime()) ? day : when.toLocaleDateString(locale, DAY_FORMAT);
}

/**
 * A time as a long local date with a 12 hour clock, such as "October 31, 2026 at 12:59 AM". It is the
 * one format for a moment in the details views. Text that is not a time is returned unchanged.
 */
export function formatMoment(when: string | number, locale?: string): string {
  const date = new Date(when);
  return Number.isNaN(date.getTime())
    ? String(when)
    : date.toLocaleString(locale, {
        ...DAY_FORMAT,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When something was made, for a list: "Today 14:32", "Yesterday 09:05" or "12 Oct 2026". */
export function formatWhen(timeMs: number, nowMs: number): string {
  const time = new Date(timeMs);
  const now = new Date(nowMs);
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
  const dayStart = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((dayStart(now) - dayStart(time)) / 86_400_000);
  if (daysAgo === 0) return `Today ${clock}`;
  if (daysAgo === 1) return `Yesterday ${clock}`;
  const month = MONTHS[time.getMonth()] ?? '';
  return `${String(time.getDate())} ${month} ${String(time.getFullYear())}`;
}
