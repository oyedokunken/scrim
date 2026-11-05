import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const groupBy = vi.fn();
const count = vi.fn();

vi.mock('@/server/db', () => ({
  getDb: () => ({ download: { groupBy, count } }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  groupBy.mockReset();
  count.mockReset();
});

describe('loadDownloadSummary', () => {
  it('returns the counts when the database answers', async () => {
    groupBy.mockResolvedValue([{ os: 'WINDOWS', version: '1.1.0', _count: { _all: 4 } }]);
    count.mockResolvedValue(2);
    const { loadDownloadSummary } = await import('@/server/download-stats');
    const summary = await loadDownloadSummary();
    expect(summary?.total).toBe(4);
    expect(summary?.periods).toEqual({ today: 2, week: 2, month: 2 });
  });

  it('tries once more after a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    groupBy
      .mockRejectedValueOnce(new Error('connection closed'))
      .mockResolvedValue([{ os: 'LINUX', version: '1.1.0', _count: { _all: 1 } }]);
    count.mockResolvedValue(1);
    const { loadDownloadSummary } = await import('@/server/download-stats');
    expect((await loadDownloadSummary())?.total).toBe(1);
    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('returns null after two failures and logs no message text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    groupBy.mockRejectedValue(new Error('password for postgres://user:secret@host failed'));
    count.mockResolvedValue(0);
    const { loadDownloadSummary } = await import('@/server/download-stats');
    expect(await loadDownloadSummary()).toBeNull();
    const logged = warn.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).not.toContain('secret');
  });
});

describe('the downloads page', () => {
  it('is read on every visit, so a failed build or refresh is never cached', () => {
    const page = readFileSync(
      new URL('../../src/app/(site)/downloads/page.tsx', import.meta.url),
      'utf8',
    );
    expect(page).toContain("export const dynamic = 'force-dynamic';");
    expect(page).not.toContain('export const revalidate');
  });
});
