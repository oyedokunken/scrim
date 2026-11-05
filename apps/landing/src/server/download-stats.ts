import 'server-only';
import { summarizeDownloads, type DownloadSummary } from '@/lib/download-stats';
import { getDb } from './db';

/** Counts of downloads by system and version. It returns null when the database cannot answer. */
export async function loadDownloadSummary(): Promise<DownloadSummary | null> {
  try {
    const rows = await getDb().download.groupBy({
      by: ['os', 'version'],
      _count: { _all: true },
    });
    return summarizeDownloads(
      rows.map((row) => ({ os: row.os, version: row.version, count: row._count._all })),
    );
  } catch {
    console.warn('download counts unavailable');
    return null;
  }
}
