import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_ORIGIN } from '@/lib/origins';
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
  it('shows www.usescrim.app on the last slide of the hero video', () => {
    expect(siteConfig.heroAddress).toBe('www.usescrim.app');
    expect(OFFICIAL_ORIGIN).toBe(`https://${siteConfig.heroAddress}`);
  });

  it('keeps the address in the config, the origin list and the redirects only', () => {
    const users = files(SRC).filter((file) => /scrim\.app/.test(readFileSync(file, 'utf8')));
    expect(users.map((file) => file.slice(SRC.length + 1).replaceAll('\\', '/'))).toEqual([
      'lib/origins.ts',
      'redirects.ts',
      'site.config.ts',
    ]);
  });

  it('draws the last slide of the hero video as butter text on green, like the first', () => {
    const css = readFileSync(join(SRC, 'components/hero-demo/hero-demo.module.css'), 'utf8');
    const tsx = readFileSync(join(SRC, 'components/hero-demo/hero-demo.tsx'), 'utf8');
    expect(css).not.toContain('lightCard');
    expect(tsx).not.toContain('lightCard');
    const card = /\.card \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(card).toContain('background: var(--scrim-green)');
    expect(card).toContain('color: var(--scrim-butter)');
  });
});
