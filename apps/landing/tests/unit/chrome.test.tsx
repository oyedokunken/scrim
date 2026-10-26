import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SuyaLink } from '@/components/suya-link';
import { siteConfig } from '@/site.config';

describe('SuyaLink', () => {
  const html = renderToStaticMarkup(<SuyaLink />);

  it('is a plain outbound link in a new tab with safe rel', () => {
    expect(html).toContain('href="https://buymeamalt.com/@oyedokunken"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('shows the exact label Buy me suya, in one place only', () => {
    expect(html).toContain('<span>Buy me suya</span>');
    expect(html.replace(/href="[^"]*"/, '')).not.toMatch(/malt/i);
  });

  it('says it opens in a new tab and hides the decorative heart', () => {
    expect(html).toContain('(opens in a new tab)');
    expect(html).toContain('aria-hidden="true"');
  });

  it('loads no script or widget', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
  });

  it('can drop the heart for the footer', () => {
    expect(renderToStaticMarkup(<SuyaLink plain />)).not.toContain('<svg');
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
  it('shows the latest version and links it to the releases page', () => {
    const html = renderToStaticMarkup(<SiteFooter version="1.2.3" year={2026} />);
    expect(html).toContain('Latest version 1.2.3');
    expect(html).toContain(`href="${siteConfig.releasesUrl}"`);
  });

  it('shows Coming soon when there is no release', () => {
    const html = renderToStaticMarkup(<SiteFooter version={null} year={2026} />);
    expect(html).toContain('Coming soon');
    expect(html).not.toContain('Latest version');
    expect(html).toContain(`href="${siteConfig.releasesUrl}"`);
  });

  it('carries the trust line, the legal row and the three columns as real text', () => {
    const html = renderToStaticMarkup(<SiteFooter version={null} year={2031} />);
    expect(html).toContain('Recordings never leave your computer.');
    expect(html).toContain('© 2031 Scrim.');
    expect(html).toContain('MIT license');
    expect(html).toContain('Built by');
    expect(html).toContain(siteConfig.author.url);
    for (const title of Object.keys(siteConfig.footerLinks)) {
      expect(html).toContain(`>${title}</h2>`);
    }
    for (const system of ['Windows', 'macOS', 'Linux']) {
      expect(html).toContain(`<li>${system}</li>`);
    }
  });

  it('hides the giant wordmark from assistive technology and never uses it as the only link', () => {
    const html = renderToStaticMarkup(<SiteFooter version={null} year={2026} />);
    const mark = /<div class="[^"]*mark[^"]*" aria-hidden="true">/.exec(html);
    expect(mark).not.toBeNull();
    expect(html.slice(html.indexOf('<text'))).not.toContain('<a ');
  });
});
