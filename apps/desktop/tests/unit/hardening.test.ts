import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/main/csp';
import { isAllowedExternalUrl } from '../../src/main/external-urls';
import { isOwnUrl, isPermissionAllowed } from '../../src/main/permissions';

describe('buildCsp', () => {
  it('is strict when packaged', () => {
    const csp = buildCsp({ packaged: true });
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
  });

  it('only loosens styles and the websocket in dev', () => {
    const csp = buildCsp({ packaged: false });
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("script-src 'self'");
  });
});

describe('isPermissionAllowed', () => {
  const dev = 'http://localhost:5173';
  it.each([
    ['media', 'http://localhost:5173/', dev, true],
    ['display-capture', 'http://localhost:5173/x', dev, true],
    ['media', 'https://evil.example/', dev, false],
    ['geolocation', 'http://localhost:5173/', dev, false],
    ['notifications', 'http://localhost:5173/', dev, false],
    ['clipboard-read', 'http://localhost:5173/', dev, false],
    ['media', 'not a url', dev, false],
    ['media', 'file:///C:/app/out/renderer/index.html', 'file://', true],
    ['media', 'https://evil.example/', 'file://', false],
    ['openExternal', 'file:///C:/app/index.html', 'file://', false],
  ])('%s from %s with origin %s is %s', (permission, url, origin, expected) => {
    expect(isPermissionAllowed(permission, url, origin)).toBe(expected);
  });
});

describe('isOwnUrl', () => {
  it('rejects other origins and other schemes', () => {
    expect(isOwnUrl('https://example.com', 'file://')).toBe(false);
    expect(isOwnUrl('file:///a/b.html', 'http://localhost:5173')).toBe(false);
    expect(isOwnUrl('http://localhost:5173/x', 'http://localhost:5173')).toBe(true);
  });
});

describe('isAllowedExternalUrl', () => {
  it.each([
    ['https://github.com/oyedokunken/scrim', true],
    ['https://github.com/oyedokunken/scrim/releases', true],
    ['https://github.com/oyedokunken/scrim-evil', false],
    ['https://github.com/someone/else', false],
    ['http://github.com/oyedokunken/scrim', false],
    ['https://github.com.evil.example/oyedokunken/scrim', false],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['nonsense', false],
  ])('%s is %s', (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected);
  });
});
