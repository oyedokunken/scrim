import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '@/security-headers';

const header = (name: string, isProduction = true) =>
  securityHeaders(isProduction).find((entry) => entry.key === name)?.value;

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy();

  it('never allows eval', () => {
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('wasm-unsafe-eval');
  });

  it('allows no third party origin', () => {
    expect(policy).not.toMatch(/https?:/);
    expect(policy).not.toContain('*');
  });

  it('locks down plugins, framing, base and forms', () => {
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it('starts from a default of same origin only', () => {
    expect(policy.startsWith("default-src 'self'")).toBe(true);
  });
});

describe('securityHeaders', () => {
  it('sets the full set in production', () => {
    expect(header('Content-Security-Policy')).toBeDefined();
    expect(header('Strict-Transport-Security')).toMatch(/max-age=63072000/);
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toMatch(/camera=\(\)/);
  });

  it('leaves the policy and HSTS out of development, which needs eval for hot reload', () => {
    expect(header('Content-Security-Policy', false)).toBeUndefined();
    expect(header('Strict-Transport-Security', false)).toBeUndefined();
    expect(header('X-Content-Type-Options', false)).toBe('nosniff');
  });
});
