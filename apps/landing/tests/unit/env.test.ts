import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envKeys, parseServerEnv, parseSiteEnv } from '@/server/env';

function readExample(): Record<string, string> {
  const text = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const entries: [string, string][] = [];
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) {
      entries.push([match[1], match[2] ?? '']);
    }
  }
  return Object.fromEntries(entries);
}

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:6543/db?pgbouncer=true',
  DIRECT_URL: 'postgresql://u:p@localhost:5432/db',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  MAIL_FROM: 'Scrim <hello@example.com>',
  IP_HASH_SECRET: 'a'.repeat(32),
  SITE_URL: 'http://localhost:3000/',
  GITHUB_REPO: 'oyedokunken/scrim',
};

describe('.env.example', () => {
  it('lists exactly the variables env.ts reads', () => {
    expect(Object.keys(readExample()).sort()).toEqual([...envKeys].sort());
  });

  it('is accepted by the validator', () => {
    expect(() => parseServerEnv(readExample())).not.toThrow();
  });

  it('holds no real looking secrets', () => {
    const example = readExample();
    expect(example.IP_HASH_SECRET).toMatch(/^change-me/);
    expect(example.GITHUB_TOKEN).toBe('');
    expect(example.SMTP_PASS).toBe('');
  });
});

describe('parseServerEnv', () => {
  it('parses and normalizes valid values', () => {
    const env = parseServerEnv(valid);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SITE_URL).toBe('http://localhost:3000');
    expect(env.SMTP_USER).toBe('');
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it('treats an empty token as unset and keeps a real one', () => {
    expect(parseServerEnv({ ...valid, GITHUB_TOKEN: '' }).GITHUB_TOKEN).toBeUndefined();
    expect(parseServerEnv({ ...valid, GITHUB_TOKEN: 'tok' }).GITHUB_TOKEN).toBe('tok');
  });

  it('names every missing variable in one readable error', () => {
    let message = '';
    try {
      parseServerEnv({});
    } catch (error) {
      message = String(error);
    }
    for (const key of envKeys.filter(
      (name) => !['SMTP_USER', 'SMTP_PASS', 'GITHUB_TOKEN'].includes(name),
    )) {
      expect(message).toContain(key);
    }
  });

  it.each([
    ['DATABASE_URL', 'mysql://x'],
    ['SMTP_PORT', '70000'],
    ['SMTP_SECURE', 'yes'],
    ['IP_HASH_SECRET', 'too-short'],
    ['SITE_URL', 'ftp://example.com'],
    ['GITHUB_REPO', 'not-a-repo'],
  ])('rejects a bad %s', (key, value) => {
    expect(() => parseServerEnv({ ...valid, [key]: value })).toThrow(new RegExp(key));
  });

  it('never prints the values it rejects', () => {
    const secret = 'super-secret-but-short';
    try {
      parseServerEnv({ ...valid, IP_HASH_SECRET: secret.slice(0, 10) });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret.slice(0, 10));
    }
  });

  it('refuses the placeholder secret in production only', () => {
    const placeholder = { ...valid, IP_HASH_SECRET: readExample().IP_HASH_SECRET ?? '' };
    expect(() => parseServerEnv(placeholder)).not.toThrow();
    expect(() => parseServerEnv({ ...placeholder, NODE_ENV: 'production' })).toThrow(/placeholder/);
  });
});

describe('parseSiteEnv', () => {
  it('needs only the site values', () => {
    expect(parseSiteEnv({ SITE_URL: 'https://scrim.example', GITHUB_REPO: 'a/b' })).toEqual({
      SITE_URL: 'https://scrim.example',
      GITHUB_REPO: 'a/b',
    });
  });

  it('fails without them', () => {
    expect(() => parseSiteEnv({})).toThrow(/SITE_URL/);
  });
});

describe('SITE_URL in a production deployment', () => {
  const site = { GITHUB_REPO: 'oyedokunken/scrim' };

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
    'http://[::1]:3000',
  ])('refuses %s so the canonical link and og:image never point at localhost', (SITE_URL) => {
    expect(() => parseSiteEnv({ ...site, SITE_URL, VERCEL_ENV: 'production' })).toThrow(
      /SITE_URL: points at this machine/,
    );
  });

  it('accepts the public address in production', () => {
    const env = parseSiteEnv({
      ...site,
      SITE_URL: 'https://scriim.vercel.app/',
      VERCEL_ENV: 'production',
    });
    expect(env.SITE_URL).toBe('https://scriim.vercel.app');
  });

  it('still allows localhost for local builds, previews and tests', () => {
    expect(() => parseSiteEnv({ ...site, SITE_URL: 'http://localhost:3000' })).not.toThrow();
    expect(() =>
      parseSiteEnv({ ...site, SITE_URL: 'http://localhost:3000', VERCEL_ENV: 'preview' }),
    ).not.toThrow();
  });
});
