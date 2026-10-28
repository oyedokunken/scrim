import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MaltLink } from '@/components/malt-link';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { siteConfig } from '@/site.config';

describe('MaltLink', () => {
  const html = renderToStaticMarkup(<MaltLink />);

  it('is a plain outbound link in a new tab with safe rel', () => {
    expect(html).toContain('href="https://buymeamalt.com/@oyedokunken"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('shows the exact label Support, from this one component', () => {
    expect(html).toContain('<span>Support</span>');
    expect(html).not.toMatch(/suya|Buy me/i);
  });

  it('says it opens in a new tab and hides the decorative heart', () => {
    expect(html).toContain('(opens in a new tab)');
    expect(html).toContain('aria-hidden="true"');
  });

  it('loads no script or widget', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
  });
});

describe('SiteHeader', () => {
  const html = renderToStaticMarkup(<SiteHeader />);

  it('reads Scrim and links home', () => {
    expect(html).toContain('aria-label="Scrim home"');
    expect(html).toContain('>Scrim<');
  });

  it('links every nav item to a section of the home page, in both navigations', () => {
    for (const item of siteConfig.nav) {
      expect(html.split(`href="/${item.href}"`).length - 1).toBe(2);
    }
  });

  it('names the sections the nav promises', () => {
    expect(siteConfig.nav.map((item) => item.label)).toEqual([
      'Features',
      'Use cases',
      'Download',
      'FAQ',
      'Contribute',
    ]);
  });

  it('shows a short Download link, with a logo, for narrow screens', () => {
    // It opens the download dialog, and without JavaScript it is a link to the Releases page.
    expect(html).toContain('data-download-trigger');
    expect(html).toContain('href="https://github.com/oyedokunken/scrim/releases"');
    expect(html).toContain('<span>Download</span>');
  });

  it('puts Support last in the menu, after every link', () => {
    const menu = html.slice(html.indexOf('aria-label="Mobile"'));
    const links = siteConfig.nav.map((item) => menu.indexOf('>' + item.label + '<'));
    const malt = menu.indexOf('>Support<');
    expect(malt).toBeGreaterThan(-1);
    for (const position of links) {
      expect(position).toBeGreaterThan(-1);
      expect(position).toBeLessThan(malt);
    }
  });

  it('has Support once, and only inside the menu', () => {
    expect(html.match(/>Support</g)).toHaveLength(1);
    const menu = html.indexOf('aria-label="Mobile"');
    expect(html.indexOf('>Support<')).toBeGreaterThan(menu);
  });

  it('labels the two navigations differently', () => {
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('aria-label="Mobile"');
  });

  it('keeps the menu a native disclosure that works without script', () => {
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
  });
});

describe('SiteFooter', () => {
  const html = renderToStaticMarkup(<SiteFooter year={2031} />);
  const copyright = `${String.fromCodePoint(0xa9)} 2031 Scrim.`;

  it('carries the legal row and the three columns as real text', () => {
    expect(html).toContain(copyright);
    expect(html).toContain('MIT license');
    expect(html).toContain('Built by');
    expect(html).toContain(siteConfig.author.url);
    for (const title of Object.keys(siteConfig.footerLinks)) {
      expect(html).toContain(`>${title}</h2>`);
    }
  });

  it('no longer shows the system chips, the version chip or the trust line', () => {
    for (const gone of [
      'Supported systems',
      'Coming soon',
      'Latest version',
      'Recordings never leave your computer.',
    ]) {
      expect(html).not.toContain(gone);
    }
    expect(html).not.toContain('<li>Windows</li>');
  });

  it('holds no back to top button of its own, only the logo link to the top', () => {
    // The floating button lives in the layout. The one link to the top in here is the big logo.
    expect(html.match(/href="#top"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Back to top"');
  });

  it('puts a Show your Support button, with a heart, under the brand text', () => {
    expect(html).toContain('<span>Show your Support</span>');
    const brand = html.indexOf('entirely on your computer.');
    const support = html.indexOf('<span>Show your Support</span>');
    const legal = html.indexOf('All rights reserved');
    expect(brand).toBeGreaterThan(-1);
    expect(support).toBeGreaterThan(brand);
    expect(support).toBeLessThan(legal);
  });

  it('has a plain legal row: the year, all rights reserved, and who built it', () => {
    expect(html).toContain('2031 Scrim. All rights reserved.');
    expect(html).not.toContain('MIT license</a></li><li>Built');
    expect(html).toContain('Built by');
    expect(html).toContain('@oyedokunken');
  });

  it('makes the giant logo a link to the top, with a name that says where it goes', () => {
    const link = /<a href="#top" class="[^"]*mark[^"]*" aria-label="([^"]+)">/.exec(html);
    expect(link).not.toBeNull();
    expect(link?.[1]).toBe('Scrim logo - back to top');
    // The drawing is inside the link, so the link is the only thing that carries it.
    expect(html.indexOf('<svg viewBox="0 0 1260 330"')).toBeGreaterThan(
      html.indexOf(link?.[0] ?? ''),
    );
    expect(html.slice(html.indexOf('<text'))).not.toContain('<a ');
  });

  it('draws the logo in white on the black footer, with no separate butter section', () => {
    expect(html).toContain('fill="var(--scrim-white)"');
    expect(html).not.toContain('markSection');
  });
});
