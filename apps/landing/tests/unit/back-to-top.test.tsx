import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackToTop } from '@/components/back-to-top';

const css = readFileSync(
  new URL('../../src/components/back-to-top.module.css', import.meta.url),
  'utf8',
);

describe('BackToTop', () => {
  const html = renderToStaticMarkup(<BackToTop />);

  it('is a link to the top with a real name, inside its own landmark', () => {
    expect(html).toContain('href="#top"');
    expect(html).toContain('aria-label="Back to top"');
    expect(html).toContain('<nav aria-label="Page controls">');
  });

  it('shows a recording timer that starts at zero and hides it from assistive technology', () => {
    expect(html).toContain('>00:00<');
    expect(html).toMatch(/aria-hidden="true"/);
  });

  it('draws a track ring and a progress ring', () => {
    expect(html.match(/<circle/g)).toHaveLength(2);
    expect(html).toContain('--p:0');
  });

  it('floats in the corner', () => {
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/right:/);
    expect(css).toMatch(/bottom:/);
  });

  it('is hidden until the page scrolls, and hidden means out of the tab order', () => {
    expect(css).toMatch(/opacity:\s*0/);
    expect(css).toMatch(/visibility:\s*hidden/);
    expect(css).toMatch(/html\[data-scrolled='true'\]/);
    expect(css).toMatch(/visibility:\s*visible/);
  });

  it('fills the red ring from the scroll progress variable, using only the token red', () => {
    expect(css).toContain('stroke-dashoffset: calc(100 - var(--p) * 100)');
    expect(css).toContain('var(--scrim-record)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('does not animate for visitors who prefer reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
