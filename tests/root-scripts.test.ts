import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('root scripts', () => {
  it('runs the desktop app in dev mode with pnpm dev', () => {
    expect(pkg.scripts['dev']).toBe('pnpm --filter @scrim/desktop dev');
  });

  it('builds an unsigned installer with pnpm package', () => {
    expect(pkg.scripts['package']).toBe('pnpm --filter @scrim/desktop package');
  });
});
