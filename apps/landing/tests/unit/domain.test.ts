import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteConfig } from '@/site.config';

const SRC = join(import.meta.dirname, '../../src');

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (name === 'generated') return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('the site address', () => {
  it('shows www.scrim.app on the last slide of the hero video only', () => {
    expect(siteConfig.heroAddress).toBe('www.scrim.app');
    const users = files(SRC).filter((file) => /scrim\.app/.test(readFileSync(file, 'utf8')));
    expect(users.map((file) => file.slice(SRC.length + 1).replaceAll('\\', '/'))).toEqual([
      'site.config.ts',
    ]);
  });
});
