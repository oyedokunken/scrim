import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease } from '@/server/releases';

const site = { GITHUB_REPO: 'oyedokunken/scrim' };

const release = {
  tag_name: 'v1.2.3',
  html_url: 'https://github.com/oyedokunken/scrim/releases/tag/v1.2.3',
  published_at: '2026-11-02T09:30:00Z',
  assets: [
    {
      name: 'Scrim-1.2.3-x64.exe',
      browser_download_url:
        'https://github.com/oyedokunken/scrim/releases/download/v1.2.3/Scrim-1.2.3-x64.exe',
      size: 1234,
    },
  ],
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchLatestRelease', () => {
  it('returns the version without the v, the page and the assets', async () => {
    const result = await fetchLatestRelease(() => json(release), site);
    expect(result).toEqual({
      version: '1.2.3',
      url: release.html_url,
      publishedAt: '2026-11-02T09:30:00Z',
      assets: [
        {
          name: 'Scrim-1.2.3-x64.exe',
          url: release.assets[0]?.browser_download_url,
          size: 1234,
        },
      ],
    });
  });

  it('asks the latest release endpoint of the configured repository and caches for minutes', async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      json(release),
    );
    await fetchLatestRelease(fetchImpl, site);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/oyedokunken/scrim/releases/latest');
    expect(init).toMatchObject({ next: { revalidate: 300 } });
  });

  it('sends the token only when there is one', async () => {
    const without = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      json(release),
    );
    await fetchLatestRelease(without, site);
    expect(JSON.stringify(without.mock.calls[0]?.[1]?.headers)).not.toContain('Authorization');

    const withToken = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      json(release),
    );
    await fetchLatestRelease(withToken, { ...site, GITHUB_TOKEN: 'abc' });
    expect(JSON.stringify(withToken.mock.calls[0]?.[1]?.headers)).toContain('Bearer abc');
  });

  it('returns null quietly when no release exists yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await fetchLatestRelease(() => json({ message: 'Not Found' }, 404), site)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns null and logs when GitHub errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await fetchLatestRelease(() => json({}, 500), site)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('returns null when the response has an unexpected shape', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await fetchLatestRelease(() => json({ tag_name: 7 }), site)).toBeNull();
  });

  it('returns null instead of throwing when the network fails or times out', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = () => Promise.reject(new Error('offline'));
    expect(await fetchLatestRelease(failing, site)).toBeNull();
  });

  it('never logs the token or the repository', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await fetchLatestRelease(() => json({}, 403), { ...site, GITHUB_TOKEN: 'secret-token' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('oyedokunken');
  });
});
