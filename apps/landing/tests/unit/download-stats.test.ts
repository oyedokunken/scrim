import { describe, expect, it } from 'vitest';
import { summarizeDownloads } from '@/lib/download-stats';

describe('summarizeDownloads', () => {
  it('lists every system, even with no downloads', () => {
    const summary = summarizeDownloads([]);
    expect(summary.total).toBe(0);
    expect(summary.bySystem).toEqual([
      { name: 'Windows', count: 0 },
      { name: 'macOS', count: 0 },
      { name: 'Linux', count: 0 },
    ]);
    expect(summary.byVersion).toEqual([]);
  });

  it('adds counts by system and by version', () => {
    const summary = summarizeDownloads([
      { os: 'WINDOWS', version: '1.0.0', count: 3 },
      { os: 'WINDOWS', version: '1.1.0', count: 2 },
      { os: 'LINUX', version: '1.1.0', count: 4 },
    ]);
    expect(summary.total).toBe(9);
    expect(summary.bySystem).toEqual([
      { name: 'Windows', count: 5 },
      { name: 'macOS', count: 0 },
      { name: 'Linux', count: 4 },
    ]);
    expect(summary.byVersion).toEqual([
      { version: '1.1.0', count: 6 },
      { version: '1.0.0', count: 3 },
    ]);
  });

  it('sorts versions as numbers, newest first', () => {
    const summary = summarizeDownloads([
      { os: 'WINDOWS', version: '1.2.0', count: 1 },
      { os: 'WINDOWS', version: '1.10.0', count: 1 },
      { os: 'WINDOWS', version: '1.9.0', count: 1 },
    ]);
    expect(summary.byVersion.map((item) => item.version)).toEqual(['1.10.0', '1.9.0', '1.2.0']);
  });
});
