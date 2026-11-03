import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/main/csp';
import { isAllowedExternalUrl } from '../../src/shared/external-urls';
import { isOwnUrl, isPermissionAllowed } from '../../src/main/permissions';

const PACKAGED_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: mediastream: scrim-media:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

describe('buildCsp', () => {
  it('matches the agreed packaged policy exactly', () => {
    expect(buildCsp({ packaged: true })).toBe(PACKAGED_POLICY);
  });

  it('never allows eval, inline code or a network origin when packaged', () => {
    const csp = buildCsp({ packaged: true });
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(csp).not.toContain('http');
  });

  it('only loosens inline code and the websocket in dev, never eval', () => {
    const csp = buildCsp({ packaged: false });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("default-src 'none'");
  });

  it('drops only frame-ancestors for a meta tag', () => {
    const meta = buildCsp({ packaged: true, forMeta: true });
    expect(meta).not.toContain('frame-ancestors');
    expect(`${meta}; frame-ancestors 'none'`).toBe(PACKAGED_POLICY);
  });
});

describe('isPermissionAllowed', () => {
  const dev = 'http://localhost:5173';
  const app = 'app://scrim';
  it.each([
    ['media', 'http://localhost:5173/', dev, true],
    ['display-capture', 'http://localhost:5173/x', dev, true],
    ['media', 'https://evil.example/', dev, false],
    ['geolocation', 'http://localhost:5173/', dev, false],
    ['notifications', 'http://localhost:5173/', dev, false],
    ['clipboard-read', 'http://localhost:5173/', dev, false],
    ['media', 'not a url', dev, false],
    ['media', 'app://scrim/index.html', app, true],
    ['media', 'app://scrim/', app, true],
    ['display-capture', 'app://scrim', app, true],
    ['media', 'app://other/index.html', app, false],
    ['media', 'https://scrim/index.html', app, false],
    ['media', 'file:///C:/app/out/renderer/index.html', app, false],
    ['media', 'null', app, false],
    ['media', '', app, false],
    ['media', 'app://evil/', app, false],
    ['display-capture', 'null', dev, false],
    ['media', 'https://evil.example/', app, false],
    ['openExternal', 'app://scrim/index.html', app, false],
  ])('%s from %s with origin %s is %s', (permission, url, origin, expected) => {
    expect(isPermissionAllowed(permission, url, origin)).toBe(expected);
  });
});

describe('isOwnUrl', () => {
  it('rejects other origins, other schemes and file URLs', () => {
    expect(isOwnUrl('https://example.com', 'app://scrim')).toBe(false);
    expect(isOwnUrl('file:///a/b.html', 'app://scrim')).toBe(false);
    expect(isOwnUrl('file:///a/b.html', 'http://localhost:5173')).toBe(false);
    expect(isOwnUrl('http://localhost:5173/x', 'http://localhost:5173')).toBe(true);
    expect(isOwnUrl('app://scrim/index.html', 'app://scrim')).toBe(true);
    expect(isOwnUrl('', 'app://scrim')).toBe(false);
  });
});

describe('isAllowedExternalUrl', () => {
  it.each([
    ['https://github.com/oyedokunken/scrim', true],
    ['https://www.oyedokun.dev/', true],
    ['https://oyedokun.dev/', true],
    ['https://www.oyedokun.dev', true],
    ['https://www.oyedokun.dev/about', false],
    ['https://www.oyedokun.dev/?next=evil', false],
    ['https://www.oyedokun.dev/#x', false],
    ['http://www.oyedokun.dev/', false],
    ['https://www.oyedokun.dev:443/', false],
    ['https://evil.oyedokun.dev/', false],
    ['https://oyedokun.dev.evil.example/', false],
    ['https://user@www.oyedokun.dev/', false],
    ['https://example.com/', false],
    ['https://github.com/oyedokunken/scrim/releases', true],
    ['https://github.com/oyedokunken', true],
    ['https://github.com/oyedokunken/', false],
    ['https://github.com/oyedokunken?tab=repositories', false],
    ['https://github.com/oyedokunken#top', false],
    ['https://github.com/someoneelse', false],
    ['https://www.linkedin.com/in/oyedokunken', true],
    ['https://www.linkedin.com/in/oyedokunken/', false],
    ['https://www.linkedin.com/in/oyedokunken?trk=x', false],
    ['https://www.linkedin.com/in/someoneelse', false],
    ['https://linkedin.com/in/oyedokunken', false],
    ['http://www.linkedin.com/in/oyedokunken', false],
    ['https://www.linkedin.com:443/in/oyedokunken', false],
    ['https://evil.example/https://www.linkedin.com/in/oyedokunken', false],
    ['https://github.com/oyedokunken/scrim-evil', false],
    ['https://github.com/someone/else', false],
    ['http://github.com/oyedokunken/scrim', false],
    ['https://github.com.evil.example/oyedokunken/scrim', false],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['nonsense', false],
    ['https://github.com:443/oyedokunken/scrim', false],
    ['https://github.com:8443/oyedokunken/scrim', false],
    ['https://user@github.com/oyedokunken/scrim', false],
    ['https://user:pass@github.com/oyedokunken/scrim', false],
  ])('%s is %s', (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected);
  });
});
