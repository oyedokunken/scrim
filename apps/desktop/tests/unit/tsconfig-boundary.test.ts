import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The lint rule in eslint.config.js is the guard against `window` and `document` in main and
// preload. This test keeps the type level backstop in place: the Node project must not pull
// the DOM lib back in, because that would hide the same mistake from the compiler.
describe('main and preload typecheck without the DOM', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../../tsconfig.node.json'), 'utf8')) as {
    compilerOptions: { lib?: string[]; types?: string[] };
  };

  it('lists no DOM lib', () => {
    const libs = (config.compilerOptions.lib ?? []).map((lib) => lib.toLowerCase());
    expect(libs.length).toBeGreaterThan(0);
    expect(libs.filter((lib) => lib.startsWith('dom') || lib === 'webworker')).toEqual([]);
  });

  it('only pulls in the Node types', () => {
    expect(config.compilerOptions.types).toEqual(['node']);
  });
});
