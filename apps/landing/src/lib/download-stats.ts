type SystemName = 'Windows' | 'macOS' | 'Linux';

/** One row of grouped counts, as the database returns it. */
export interface DownloadGroup {
  os: 'WINDOWS' | 'MACOS' | 'LINUX';
  version: string;
  count: number;
}

/** Downloads in each recent period. */
export interface PeriodCounts {
  today: number;
  week: number;
  month: number;
}

export interface DownloadSummary {
  total: number;
  periods: PeriodCounts;
  bySystem: { name: SystemName; count: number }[];
  byVersion: { version: string; count: number }[];
}

const NAMES: Record<DownloadGroup['os'], SystemName> = {
  WINDOWS: 'Windows',
  MACOS: 'macOS',
  LINUX: 'Linux',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/** Newest first, comparing each dotted number in turn. */
function compareVersionsDescending(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * Turns grouped counts into what the page shows. Only counts leave the database: no names, no
 * emails and no addresses are ever part of this summary.
 */
export function summarizeDownloads(
  groups: readonly DownloadGroup[],
  periods: PeriodCounts = { today: 0, week: 0, month: 0 },
): DownloadSummary {
  const systems = new Map<SystemName, number>([
    ['Windows', 0],
    ['macOS', 0],
    ['Linux', 0],
  ]);
  const versions = new Map<string, number>();
  let total = 0;
  for (const group of groups) {
    total += group.count;
    const name = NAMES[group.os];
    systems.set(name, (systems.get(name) ?? 0) + group.count);
    versions.set(group.version, (versions.get(group.version) ?? 0) + group.count);
  }
  return {
    total,
    periods,
    bySystem: [...systems].map(([name, count]) => ({ name, count })),
    byVersion: [...versions]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => compareVersionsDescending(a.version, b.version)),
  };
}

/**
 * Where today, this week and this month begin, in UTC so every visitor sees the same numbers.
 * The week starts on Monday.
 */
export function periodStarts(now: Date): { today: Date; week: Date; month: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  return {
    today,
    week: new Date(today.getTime() - sinceMonday * DAY_MS),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}
