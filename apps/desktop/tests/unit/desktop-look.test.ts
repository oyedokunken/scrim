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

  it('fixes the window and scrolls inside the main area and the panel only', () => {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*height: 100%;[^}]*overflow: hidden/s);
    expect(css).toMatch(/\.shell-main\s*\{[^}]*overflow-y: auto/s);
    expect(css).toMatch(/\.shell-panel\s*\{[^}]*overflow-y: auto/s);
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

describe('the shared primitives stylesheet', () => {
  const ui = readFileSync(join(__dirname, '../../src/renderer/ui/ui.css'), 'utf8');

  it('is part of the app', () => {
    expect(css).toContain("@import '../ui/ui.css'");
  });

  it('uses only palette colors, no raw hex values', () => {
    expect(ui).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/);
  });

  it('uses the radii and 32 px minimum targets from the design', () => {
    for (const radius of ['16px', '12px', '8px', '6px']) expect(ui).toContain(radius);
    expect(ui).toMatch(/\.ui-segment\s*\{[^}]*min-height: 32px/s);
  });

  it('hides a closed sheet, which a display rule would otherwise keep on screen', () => {
    expect(ui).toMatch(/\.ui-sheet:not\(\[open\]\)\s*\{\s*display: none/);
  });

  it('shows a pointer on interactive primitives, and not-allowed when disabled', () => {
    expect(ui).not.toContain('cursor: default');
    for (const name of ['ui-button', 'ui-segment', 'ui-switch', 'ui-tile']) {
      const start = ui.indexOf(`.${name} {`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      expect(ui.slice(start, ui.indexOf('}', start)), name).toContain('cursor: pointer');
    }
    expect(ui).toContain('cursor: not-allowed');
  });

  it('gives the primitives a hover state', () => {
    for (const hover of ['.ui-segment:hover', '.ui-tile:hover', '.ui-button-primary:hover']) {
      expect(ui).toContain(hover);
    }
  });
});
