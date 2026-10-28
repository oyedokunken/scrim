import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('@scrim/tokens package', () => {
  it('has no runtime dependencies', () => {
    const pkg: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).not.toHaveProperty('peerDependencies');
  });

  it('exposes the module, the stylesheet and the brand mark', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(pkg.exports)).toEqual(['.', './tokens.css', './brand/scrim-mark.svg']);
  });
});
