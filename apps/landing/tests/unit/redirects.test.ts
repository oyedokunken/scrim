import { describe, expect, it } from 'vitest';
import config from '../../next.config';
import { OFFICIAL_ORIGIN, OLD_HOST, PREVIOUS_HOST, oldAddressRedirects } from '@/redirects';

describe('the old address redirect', () => {
  const [rule, previous] = oldAddressRedirects();

  it('is one permanent rule per old host, each matching the exact host', () => {
    expect(oldAddressRedirects()).toHaveLength(2);
    expect(rule?.permanent).toBe(true);
    expect(rule?.has).toEqual([{ type: 'host', value: OLD_HOST }]);
    expect(OLD_HOST).toBe('scriim.vercel.app');
    expect(previous?.permanent).toBe(true);
    expect(previous?.has).toEqual([{ type: 'host', value: PREVIOUS_HOST }]);
    expect(PREVIOUS_HOST).toBe('scrim.oyedokun.dev');
  });

  it('keeps the path and the query, and goes to the official address over https', () => {
    expect(rule?.source).toBe('/:path*');
    expect(rule?.destination).toBe(`${OFFICIAL_ORIGIN}/:path*`);
    expect(OFFICIAL_ORIGIN).toBe('https://www.usescrim.app');
  });

  it('cannot loop, because the destination host is not the matched host', () => {
    expect(new URL(OFFICIAL_ORIGIN).host).not.toBe(OLD_HOST);
    expect(new URL(OFFICIAL_ORIGIN).host).not.toBe(PREVIOUS_HOST);
  });

  it('does not match preview addresses, because the host value is an exact name', () => {
    const pattern = new RegExp(`^${OLD_HOST.replaceAll('.', '[.]')}$`);
    expect(pattern.test('scriim.vercel.app')).toBe(true);
    expect(pattern.test('scriim-git-feat-x-oyedokunken.vercel.app')).toBe(false);
    expect(pattern.test('scriim-abc123.vercel.app')).toBe(false);
    expect(pattern.test('www.usescrim.app')).toBe(false);
  });

  it('is wired into the Next config', async () => {
    expect(await config.redirects?.()).toEqual(oldAddressRedirects());
  });
});
