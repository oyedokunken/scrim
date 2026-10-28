import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/main/csp';

const css = readFileSync(join(__dirname, '../../src/renderer/src/styles.css'), 'utf8');

describe('the desktop look', () => {
  it('bundles the latin Urbanist file and blocks the system font during load', () => {
    expect(css).toContain('urbanist-latin-wght-normal.woff2');
    expect(css).toMatch(/font-family: 'Urbanist Variable'/);
    expect(css).toMatch(/font-display: block/);
    expect(css).not.toContain('latin-ext');
  });

  it('never reaches for a font on the network, and the policy allows only our own', () => {
    expect(css).not.toMatch(/url\(\s*['"]?https?:/);
    expect(buildCsp({ packaged: true })).toContain("font-src 'self'");
  });

  it('uses the shared font stack from the tokens', () => {
    expect(css).toContain('var(--scrim-font');
  });

  it('fixes the window and scrolls inside the screen only', () => {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*height: 100%;[^}]*overflow: hidden/s);
    expect(css).toMatch(/\.screen\s*\{[^}]*overflow-y: auto/s);
  });

  it('has no centered column', () => {
    expect(css).not.toMatch(/max-width/);
  });

  it('keeps chrome unselectable and text fields selectable', () => {
    expect(css).toMatch(/body\s*\{[^}]*user-select: none/s);
    expect(css).toMatch(/input,\s*textarea[^{]*\{\s*user-select: text/s);
  });

  it('respects reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
