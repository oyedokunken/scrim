import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Hero } from '@/components/sections/hero';
import { SiteFooter } from '@/components/site-footer';
import { VersionPill } from '@/components/version-pill';

describe('VersionPill', () => {
  it('shows the version with a v and a screen reader word', () => {
    const html = renderToStaticMarkup(<VersionPill version="1.1.0" />);
    expect(html).toContain('v1.1.0');
    expect(html).toContain('Version ');
  });

  it('does not double the v and renders nothing without a version', () => {
    expect(renderToStaticMarkup(<VersionPill version="v2.0.0" />)).not.toContain('vv2');
    expect(renderToStaticMarkup(<VersionPill version={null} />)).toBe('');
  });
});

describe('where the pill appears', () => {
  it('sits beside the headline, outside the heading element', () => {
    const html = renderToStaticMarkup(<Hero version="1.1.0" />);
    const heading = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? '';
    expect(heading).not.toContain('v1.1.0');
    expect(html).toContain('v1.1.0');
  });

  it('sits beside the footer logo', () => {
    expect(renderToStaticMarkup(<SiteFooter year={2031} version="1.1.0" />)).toContain('v1.1.0');
    expect(renderToStaticMarkup(<SiteFooter year={2031} />)).not.toContain('>v1');
  });
});
