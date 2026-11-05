import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound from '@/app/not-found';

describe('the 404 page', () => {
  const html = renderToStaticMarkup(<NotFound />);

  it('says the page is missing and links home', () => {
    expect(html).toContain('This page does not exist');
    expect(html).toContain('href="/"');
  });

  it('has no site header, footer or navigation', () => {
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
    expect(html).not.toContain('<nav');
  });

  it('sits outside the group whose layout draws the header and footer', () => {
    const root = readFileSync(new URL('../../src/app/layout.tsx', import.meta.url), 'utf8');
    expect(root).not.toContain('SiteHeader');
    expect(root).not.toContain('SiteFooter');
    const site = readFileSync(new URL('../../src/app/(site)/layout.tsx', import.meta.url), 'utf8');
    expect(site).toContain('SiteHeader');
    expect(site).toContain('SiteFooter');
  });
});
