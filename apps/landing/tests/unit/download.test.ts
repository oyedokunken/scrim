import { describe, expect, it } from 'vitest';
import { matchAsset, type AssetLike } from '@/lib/asset-match';
import { downloadRequestSchema, fieldErrors } from '@/lib/download-request';
import {
  HOURLY_LIMIT,
  MAX_BODY_BYTES,
  handleDownloadRequest,
  type DownloadDeps,
  type DownloadStore,
  type RecordEntry,
  type RecordResult,
} from '@/server/downloads';
import { clientIp, hashIp, truncateUserAgent } from '@/server/ip';
import type { LatestRelease } from '@/server/releases';

const valid = { name: 'Ada Lovelace', email: 'ada@example.com', os: 'windows' as const };

describe('downloadRequestSchema', () => {
  it('accepts a minimal request and defaults the updates box to off', () => {
    const parsed = downloadRequestSchema.parse(valid);
    expect(parsed.updatesOptIn).toBe(false);
  });

  it('trims the name and lower cases and trims the email', () => {
    const parsed = downloadRequestSchema.parse({
      ...valid,
      name: '  Ada  ',
      email: '  Ada@Example.COM ',
    });
    expect(parsed.name).toBe('Ada');
    expect(parsed.email).toBe('ada@example.com');
  });

  it.each([
    ['an empty name', { name: '' }, 'name'],
    ['a name of spaces', { name: '   ' }, 'name'],
    ['a name over 80 characters', { name: 'a'.repeat(81) }, 'name'],
    ['an email with no at sign', { email: 'ada.example.com' }, 'email'],
    ['an empty email', { email: '' }, 'email'],
    ['an email over 254 characters', { email: `${'a'.repeat(250)}@example.com` }, 'email'],
    ['an unknown system', { os: 'beos' }, 'os'],
    ['a missing system', { os: undefined }, 'os'],
  ])('rejects %s', (_label, change, field) => {
    const result = downloadRequestSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)[field]).toBeTruthy();
    }
  });

  it('accepts an 80 character name and a 254 character email', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
    const email = `${local}@${domain}`;
    expect(email.length).toBeLessThanOrEqual(254);
    expect(downloadRequestSchema.safeParse({ ...valid, name: 'a'.repeat(80), email }).success).toBe(
      true,
    );
  });

  it('refuses fields it does not know', () => {
    expect(downloadRequestSchema.safeParse({ ...valid, admin: true }).success).toBe(false);
  });

  it('refuses a wrong type for the updates box', () => {
    expect(downloadRequestSchema.safeParse({ ...valid, updatesOptIn: 'yes' }).success).toBe(false);
  });

  it('keeps the first message for each field', () => {
    const result = downloadRequestSchema.safeParse({ name: '', email: 'x', os: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(['email', 'name', 'os']);
    }
  });

  it('accepts the optional chip, package and honeypot fields', () => {
    expect(
      downloadRequestSchema.safeParse({
        ...valid,
        os: 'linux',
        arch: 'arm64',
        format: 'deb',
        website: '',
      }).success,
    ).toBe(true);
  });
});

const asset = (name: string): AssetLike => ({ name, url: `https://example.com/${name}`, size: 1 });

describe('matchAsset', () => {
  const release = [
    asset('Scrim-1.0.0-x64.exe'),
    asset('Scrim-1.0.0-arm64.exe'),
    asset('Scrim-1.0.0-x64.exe.blockmap'),
    asset('Scrim-1.0.0-arm64.dmg'),
    asset('Scrim-1.0.0-x64.dmg'),
    asset('Scrim-1.0.0-x86_64.AppImage'),
    asset('Scrim-1.0.0-aarch64.AppImage'),
    asset('scrim_1.0.0_amd64.deb'),
    asset('scrim_1.0.0_arm64.deb'),
    asset('latest.yml'),
    asset('SHA256SUMS.txt'),
  ];

  it.each([
    ['Windows on Intel', { os: 'windows', arch: 'x64' }, 'Scrim-1.0.0-x64.exe'],
    ['Windows on Arm', { os: 'windows', arch: 'arm64' }, 'Scrim-1.0.0-arm64.exe'],
    ['Windows with no chip given', { os: 'windows' }, 'Scrim-1.0.0-x64.exe'],
    ['a Mac with Apple Silicon', { os: 'macos', arch: 'arm64' }, 'Scrim-1.0.0-arm64.dmg'],
    ['an Intel Mac', { os: 'macos', arch: 'x64' }, 'Scrim-1.0.0-x64.dmg'],
    [
      'Linux, AppImage',
      { os: 'linux', arch: 'x64', format: 'appimage' },
      'Scrim-1.0.0-x86_64.AppImage',
    ],
    [
      'Linux on Arm, AppImage',
      { os: 'linux', arch: 'arm64', format: 'appimage' },
      'Scrim-1.0.0-aarch64.AppImage',
    ],
    ['Linux, deb', { os: 'linux', arch: 'x64', format: 'deb' }, 'scrim_1.0.0_amd64.deb'],
    ['Linux on Arm, deb', { os: 'linux', arch: 'arm64', format: 'deb' }, 'scrim_1.0.0_arm64.deb'],
    ['Linux with no package given', { os: 'linux', arch: 'x64' }, 'Scrim-1.0.0-x86_64.AppImage'],
  ] as const)('picks the right file for %s', (_label, wanted, expected) => {
    expect(matchAsset(release, wanted)?.name).toBe(expected);
  });

  it('never returns checksums, signatures or update files', () => {
    expect(
      matchAsset([asset('latest.yml'), asset('Scrim.exe.blockmap')], { os: 'windows' }),
    ).toBeNull();
  });

  it('returns null rather than a file for the wrong system', () => {
    expect(matchAsset([asset('Scrim-1.0.0-x64.exe')], { os: 'macos', arch: 'arm64' })).toBeNull();
    expect(matchAsset([asset('Scrim-1.0.0-x64.dmg')], { os: 'linux' })).toBeNull();
  });

  it('returns null rather than the wrong architecture', () => {
    expect(matchAsset([asset('Scrim-1.0.0-x64.exe')], { os: 'windows', arch: 'arm64' })).toBeNull();
    expect(matchAsset([asset('Scrim-1.0.0-arm64.exe')], { os: 'windows', arch: 'x64' })).toBeNull();
  });

  it('treats an installer with no architecture in its name as 64 bit Intel', () => {
    expect(matchAsset([asset('Scrim-Setup.exe')], { os: 'windows', arch: 'x64' })?.name).toBe(
      'Scrim-Setup.exe',
    );
    expect(matchAsset([asset('Scrim-Setup.exe')], { os: 'windows', arch: 'arm64' })).toBeNull();
  });

  it('uses a universal Mac build for either chip, but prefers an exact one', () => {
    const universal = [asset('Scrim-1.0.0-universal.dmg')];
    expect(matchAsset(universal, { os: 'macos', arch: 'arm64' })?.name).toBe(
      'Scrim-1.0.0-universal.dmg',
    );
    expect(matchAsset(universal, { os: 'macos', arch: 'x64' })?.name).toBe(
      'Scrim-1.0.0-universal.dmg',
    );
    expect(
      matchAsset([...universal, asset('Scrim-1.0.0-arm64.dmg')], { os: 'macos', arch: 'arm64' })
        ?.name,
    ).toBe('Scrim-1.0.0-arm64.dmg');
  });

  it('prefers an exe over an msi and matches extensions in any case', () => {
    expect(
      matchAsset([asset('Scrim-x64.msi'), asset('Scrim-x64.exe')], { os: 'windows' })?.name,
    ).toBe('Scrim-x64.exe');
    expect(matchAsset([asset('SCRIM-X64.EXE')], { os: 'windows' })?.name).toBe('SCRIM-X64.EXE');
  });

  it('returns null for an empty release', () => {
    expect(matchAsset([], { os: 'windows' })).toBeNull();
  });
});

describe('hashIp and clientIp', () => {
  it('gives the same hash for the same address and secret, and 64 hex characters', () => {
    const hash = hashIp('203.0.113.9', 'a'.repeat(32));
    expect(hash).toBe(hashIp('203.0.113.9', 'a'.repeat(32)));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with the address and with the secret', () => {
    const base = hashIp('203.0.113.9', 'a'.repeat(32));
    expect(hashIp('203.0.113.10', 'a'.repeat(32))).not.toBe(base);
    expect(hashIp('203.0.113.9', 'b'.repeat(32))).not.toBe(base);
  });

  it('does not contain the address', () => {
    expect(hashIp('203.0.113.9', 'a'.repeat(32))).not.toContain('203');
  });

  it('reads the first address from x-forwarded-for, then x-real-ip, then says unknown', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }))).toBe(
      '198.51.100.7',
    );
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8');
    expect(clientIp(new Headers())).toBe('unknown');
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBe('unknown');
  });

  it('cuts a browser string to 200 characters and drops an empty one', () => {
    expect(truncateUserAgent('x'.repeat(500))).toHaveLength(200);
    expect(truncateUserAgent('  Mozilla  ')).toBe('Mozilla');
    expect(truncateUserAgent('   ')).toBeNull();
    expect(truncateUserAgent(null)).toBeNull();
  });
});

const RELEASES_URL = 'https://github.com/oyedokunken/scrim/releases';
const SECRET = 'a'.repeat(32);
const ORIGIN = 'http://localhost:3000';
const TOKEN = '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11';
const RECORDED: RecordResult = {
  downloadId: 'download-1',
  unsubscribeToken: TOKEN,
  emailedRecently: false,
};

const release: LatestRelease = {
  version: '1.2.3',
  url: `${RELEASES_URL}/tag/v1.2.3`,
  publishedAt: '2026-11-02T09:30:00Z',
  assets: [
    {
      name: 'Scrim-1.2.3-x64.exe',
      url: `${RELEASES_URL}/download/v1.2.3/Scrim-1.2.3-x64.exe`,
      size: 1,
    },
    {
      name: 'Scrim-1.2.3-arm64.dmg',
      url: `${RELEASES_URL}/download/v1.2.3/Scrim-1.2.3-arm64.dmg`,
      size: 1,
    },
  ],
};

function setup(overrides: Partial<DownloadDeps> = {}, store?: Partial<DownloadStore>) {
  const recorded: RecordEntry[] = [];
  const logs: string[] = [];
  const counts: { ipHash: string; since: Date }[] = [];
  const deps: DownloadDeps = {
    store: {
      countRecent: (ipHash, since) => {
        counts.push({ ipHash, since });
        return Promise.resolve(0);
      },
      record: (entry) => {
        recorded.push(entry);
        return Promise.resolve(RECORDED);
      },
      markEmailSent: () => Promise.resolve(),
      ...store,
    },
    getRelease: () => Promise.resolve(release),
    ipSecret: SECRET,
    releasesUrl: RELEASES_URL,
    siteOrigin: ORIGIN,
    now: () => new Date('2026-11-02T12:00:00Z'),
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { deps, recorded, logs, counts };
}

const headers = (extra: Record<string, string> = {}) =>
  new Headers({
    'content-type': 'application/json',
    origin: ORIGIN,
    host: 'localhost:3000',
    'user-agent': 'TestBrowser/1.0',
    'x-forwarded-for': '203.0.113.9',
    ...extra,
  });

const body = (data: unknown) => JSON.stringify(data);

describe('handleDownloadRequest', () => {
  it('records the person and the download and points at the matching file', async () => {
    const { deps, recorded } = setup();
    const result = await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      url: release.assets[0]?.url,
      filename: 'Scrim-1.2.3-x64.exe',
      version: '1.2.3',
      direct: true,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      updatesOptIn: false,
      os: 'windows',
      arch: null,
      version: '1.2.3',
      userAgent: 'TestBrowser/1.0',
    });
  });

  it('stores a hash of the address, never the address', async () => {
    const { deps, recorded } = setup();
    await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(recorded[0]?.ipHash).toBe(hashIp('203.0.113.9', SECRET));
    expect(JSON.stringify(recorded)).not.toContain('203.0.113.9');
  });

  it('sends the chosen chip to the matcher', async () => {
    const { deps, recorded } = setup();
    const result = await handleDownloadRequest(
      { headers: headers(), bodyText: body({ ...valid, os: 'macos', arch: 'arm64' }) },
      deps,
    );
    expect(result.body).toMatchObject({ filename: 'Scrim-1.2.3-arm64.dmg', direct: true });
    expect(recorded[0]?.arch).toBe('arm64');
  });

  it('points at the Releases page when there is no release yet, and records version unreleased', async () => {
    const { deps, recorded } = setup({ getRelease: () => Promise.resolve(null) });
    const result = await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ url: RELEASES_URL, filename: '', version: '', direct: false });
    expect(recorded[0]?.version).toBe('unreleased');
  });

  it('points at the Releases page when no file fits the visitor system', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest(
      { headers: headers(), bodyText: body({ ...valid, os: 'linux' }) },
      deps,
    );
    expect(result.body).toEqual({
      url: RELEASES_URL,
      filename: '',
      version: '1.2.3',
      direct: false,
    });
  });

  it('records the opt in only when it was ticked', async () => {
    const { deps, recorded } = setup();
    await handleDownloadRequest(
      { headers: headers(), bodyText: body({ ...valid, updatesOptIn: true }) },
      deps,
    );
    expect(recorded[0]?.updatesOptIn).toBe(true);
  });

  it('answers a bot politely and records nothing', async () => {
    const { deps, recorded, counts } = setup();
    const result = await handleDownloadRequest(
      { headers: headers(), bodyText: body({ ...valid, website: 'http://spam.example' }) },
      deps,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ url: RELEASES_URL, filename: '', version: '', direct: false });
    expect(recorded).toHaveLength(0);
    expect(counts).toHaveLength(0);
  });

  it('refuses the eleventh download in an hour from one network', async () => {
    const { deps, recorded } = setup({}, { countRecent: () => Promise.resolve(HOURLY_LIMIT) });
    const result = await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(result.status).toBe(429);
    expect(JSON.stringify(result.body)).toMatch(/try again in an hour/);
    expect(recorded).toHaveLength(0);
  });

  it('allows the tenth', async () => {
    const { deps } = setup({}, { countRecent: () => Promise.resolve(HOURLY_LIMIT - 1) });
    expect(
      (await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps)).status,
    ).toBe(200);
  });

  it('counts only the last hour, for this address', async () => {
    const { deps, counts } = setup();
    await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(counts[0]?.ipHash).toBe(hashIp('203.0.113.9', SECRET));
    expect(counts[0]?.since.toISOString()).toBe('2026-11-02T11:00:00.000Z');
  });

  it('still returns the file when the database fails to count', async () => {
    const { deps, logs } = setup({}, { countRecent: () => Promise.reject(new Error('db down')) });
    const result = await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ direct: true });
    expect(logs).toEqual(['Could not check the download rate limit.']);
  });

  it('still returns the file when the database fails to record', async () => {
    const { deps, logs } = setup({}, { record: () => Promise.reject(new Error('db down')) });
    const result = await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ direct: true });
    expect(logs).toEqual(['Could not record a download.']);
  });

  it('never logs a name, an email, an address or a database message', async () => {
    const { deps, logs } = setup(
      {},
      {
        countRecent: () =>
          Promise.reject(new Error('password authentication failed for user ada@example.com')),
        record: () => Promise.reject(new Error('insert failed for ada@example.com at 203.0.113.9')),
      },
    );
    await handleDownloadRequest({ headers: headers(), bodyText: body(valid) }, deps);
    const text = logs.join(' ');
    for (const secret of ['ada@example.com', 'Ada', '203.0.113.9', 'password', SECRET]) {
      expect(text).not.toContain(secret);
    }
  });

  it('refuses a request that is not JSON', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest(
      { headers: headers({ 'content-type': 'text/plain' }), bodyText: body(valid) },
      deps,
    );
    expect(result.status).toBe(415);
  });

  it('refuses a body over the size limit', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest(
      { headers: headers(), bodyText: body({ ...valid, name: 'a'.repeat(MAX_BODY_BYTES) }) },
      deps,
    );
    expect(result.status).toBe(413);
  });

  it.each([
    ['no Origin header', { origin: '' }],
    ['a foreign origin', { origin: 'https://evil.example', host: 'localhost:3000' }],
    ['an origin that is not a URL', { origin: 'not a url' }],
  ])('refuses a request with %s', async (_label, extra) => {
    const { deps, recorded } = setup();
    const h = headers(extra);
    if (extra.origin === '') {
      h.delete('origin');
    }
    const result = await handleDownloadRequest({ headers: h, bodyText: body(valid) }, deps);
    expect(result.status).toBe(403);
    expect(recorded).toHaveLength(0);
  });

  it('accepts the site origin even when the host header differs, as behind a proxy', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest(
      { headers: headers({ host: 'internal:8080' }), bodyText: body(valid) },
      deps,
    );
    expect(result.status).toBe(200);
  });

  it('accepts a matching host on another port in development', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest(
      {
        headers: headers({ origin: 'http://localhost:3001', host: 'localhost:3001' }),
        bodyText: body(valid),
      },
      deps,
    );
    expect(result.status).toBe(200);
  });

  it('refuses text that is not JSON', async () => {
    const { deps } = setup();
    const result = await handleDownloadRequest({ headers: headers(), bodyText: '{not json' }, deps);
    expect(result.status).toBe(400);
  });

  it('answers a bad form with the message for each field', async () => {
    const { deps, recorded } = setup();
    const result = await handleDownloadRequest(
      { headers: headers(), bodyText: body({ name: '', email: 'nope', os: 'windows' }) },
      deps,
    );
    expect(result.status).toBe(400);
    const fields = (result.body as { fields?: Record<string, string> }).fields;
    expect(fields?.name).toBeTruthy();
    expect(fields?.email).toBeTruthy();
    expect(recorded).toHaveLength(0);
  });

  describe('the thank you email job', () => {
    it('asks for an email with the details of the download', async () => {
      const { deps } = setup();
      const result = await handleDownloadRequest(
        { headers: headers(), bodyText: body(valid) },
        deps,
      );
      expect(result.email).toEqual({
        to: 'ada@example.com',
        name: 'Ada Lovelace',
        os: 'windows',
        direct: true,
        filename: 'Scrim-1.2.3-x64.exe',
        version: '1.2.3',
        url: release.assets[0]?.url,
        unsubscribeToken: TOKEN,
        downloadId: 'download-1',
      });
    });

    it('asks for an email even when the download points at the Releases page', async () => {
      const { deps } = setup({ getRelease: () => Promise.resolve(null) });
      const result = await handleDownloadRequest(
        { headers: headers(), bodyText: body(valid) },
        deps,
      );
      expect(result.email).toMatchObject({
        direct: false,
        url: RELEASES_URL,
        filename: '',
        version: '',
      });
    });

    it('sends at most one email per address per hour', async () => {
      const { deps } = setup(
        {},
        { record: () => Promise.resolve({ ...RECORDED, emailedRecently: true }) },
      );
      const result = await handleDownloadRequest(
        { headers: headers(), bodyText: body(valid) },
        deps,
      );
      expect(result.status).toBe(200);
      expect(result.email).toBeUndefined();
    });

    it('sends no email when the download could not be recorded, as there is no unsubscribe token', async () => {
      const { deps } = setup({}, { record: () => Promise.reject(new Error('db down')) });
      const result = await handleDownloadRequest(
        { headers: headers(), bodyText: body(valid) },
        deps,
      );
      expect(result.status).toBe(200);
      expect(result.email).toBeUndefined();
    });

    it('sends no email to a bot, or for a refused request', async () => {
      const { deps } = setup();
      const bot = await handleDownloadRequest(
        { headers: headers(), bodyText: body({ ...valid, website: 'x' }) },
        deps,
      );
      const bad = await handleDownloadRequest(
        { headers: headers(), bodyText: body({ ...valid, email: 'nope' }) },
        deps,
      );
      expect(bot.email).toBeUndefined();
      expect(bad.email).toBeUndefined();
    });
  });
});
