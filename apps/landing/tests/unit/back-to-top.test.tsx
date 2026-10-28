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

  it('has no timer: no clock text and no time element', () => {
    expect(html).not.toMatch(/\d\d:\d\d/);
    expect(html).not.toContain('time');
    expect(css).not.toMatch(/\.time\b/);
  });

  it('hides its decoration from assistive technology and leaves the link name to the label', () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/innerCircle[^>]*aria-hidden="true"/);
    expect(html).toMatch(/face[^>]*aria-hidden="true"/);
  });

  it('draws a track ring, a progress ring and a solid inner circle', () => {
    expect(html.match(/<circle/g)).toHaveLength(2);
    expect(html).toMatch(/class="[^"]*innerCircle[^"]*"/);
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

  it('fills a green ring from the scroll progress variable, over a faded green track', () => {
    expect(css).toContain('stroke-dashoffset: calc(100 - var(--p) * 100)');
    expect(css).toMatch(/\.progress\s*\{[^}]*stroke:\s*var\(--scrim-green\)/s);
    expect(css).toMatch(
      /\.track\s*\{[^}]*stroke:\s*color-mix\(in srgb, var\(--scrim-green\) \d+%, transparent\)/s,
    );
  });

  it('has a solid green inner circle, and no record red anywhere', () => {
    expect(css).toMatch(/\.innerCircle\s*\{[^}]*background:\s*var\(--scrim-green\)/s);
    expect(css).not.toContain('--scrim-record');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('does not animate for visitors who prefer reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
