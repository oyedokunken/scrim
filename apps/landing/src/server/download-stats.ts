import 'server-only';
import { periodStarts, summarizeDownloads, type DownloadSummary } from '@/lib/download-stats';
import { getDb } from './db';

/** Counts of downloads by system, version and period. It returns null when the database cannot answer. */
export async function loadDownloadSummary(): Promise<DownloadSummary | null> {
  try {
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
  } catch {
    console.warn('download counts unavailable');
    return null;
  }
}
