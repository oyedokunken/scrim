import 'server-only';
import { periodStarts, summarizeDownloads, type DownloadSummary } from '@/lib/download-stats';
import { getDb } from './db';

async function query(): Promise<DownloadSummary> {
  const db = getDb();
  const starts = periodStarts(new Date());
  const [rows, today, week, month] = await Promise.all([
    db.download.groupBy({ by: ['os', 'version'], _count: { _all: true } }),
    db.download.count({ where: { createdAt: { gte: starts.today } } }),
    db.download.count({ where: { createdAt: { gte: starts.week } } }),
    db.download.count({ where: { createdAt: { gte: starts.month } } }),
  ]);
  return summarizeDownloads(
    rows.map((row) => ({ os: row.os, version: row.version, count: row._count._all })),
    { today, week, month },
  );
}

/**
 * Counts of downloads by system, version and period. A failed query is tried once more, because a
 * pooled connection can be closed between requests. It returns null when the database still cannot
 * answer. Only the kind of error is logged, never a message that could hold a connection detail.
 */
export async function loadDownloadSummary(): Promise<DownloadSummary | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown';
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      console.warn(`download counts unavailable (attempt ${attempt}): ${kind} ${code}`.trim());
    }
  }
  return null;
}
