import { describe, expect, it } from 'vitest';
import { KNOWN_ORIGINS, OFFICIAL_ORIGIN, isOwnOrigin } from '@/lib/origins';

const SITE = 'https://scrim.example';

function request(origin: string | null, host = 'elsewhere.example'): Headers {
  const headers = new Headers({ host });
  if (origin !== null) headers.set('origin', origin);
  return headers;
}

describe('the origins that may call the API', () => {
  it('names the official address first, over https', () => {
    expect(KNOWN_ORIGINS[0]).toBe(OFFICIAL_ORIGIN);
    expect(OFFICIAL_ORIGIN).toBe('https://www.usescrim.app');
    for (const origin of KNOWN_ORIGINS) expect(origin.startsWith('https://')).toBe(true);
  });

  it.each([
    ['the official address', 'https://www.usescrim.app'],
    ['the bare domain', 'https://usescrim.app'],
    ['the previous address', 'https://scrim.oyedokun.dev'],
    ['the configured address', SITE],
  ])('accepts %s', (_name, origin) => {
    expect(isOwnOrigin(request(origin), SITE)).toBe(true);
  });

  it('accepts the host that received the request', () => {
    expect(isOwnOrigin(request('https://preview.example', 'preview.example'), SITE)).toBe(true);
  });

  it.each([
    ['no Origin header', null],
    ['a foreign origin', 'https://evil.example'],
    ['a look alike of the official address', 'https://www.usescrim.app.evil.example'],
    ['the official host over http', 'http://www.usescrim.app'],
    ['an origin that is not a URL', 'not a url'],
  ])('refuses %s', (_name, origin) => {
    expect(isOwnOrigin(request(origin), SITE)).toBe(false);
  });
});
