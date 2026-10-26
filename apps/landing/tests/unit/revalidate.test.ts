import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELEASE_REVALIDATE_SECONDS } from '@/server/releases';

describe('release revalidation', () => {
  it('regenerates pages as often as release data is cached', () => {
    const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
    const match = /export const revalidate = (\d+);/.exec(page);
    expect(match?.[1]).toBeDefined();
    expect(Number(match?.[1])).toBe(RELEASE_REVALIDATE_SECONDS);
  });
});
