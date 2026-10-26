import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuiltBy } from '@/components/built-by';
import { MaltLink } from '@/components/malt-link';
import { Features } from '@/components/sections/features';
import { isExternal, SiteLink } from '@/components/site-link';
import { TooltipLink } from '@/components/tooltip';
import { siteConfig } from '@/site.config';

describe('isExternal', () => {
  it.each([
    ['https://github.com/oyedokunken/scrim', true],
    ['http://example.com', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['//cdn.example.com/file.js', true],
    ['/privacy', false],
    ['/#features', false],
    ['#top', false],
    ['mailto:hello@scrim.app', false],
    ['tel:+123', false],
    ['privacy', false],
  ])('%s is external: %s', (href, expected) => {
    expect(isExternal(href)).toBe(expected);
  });
});

describe('SiteLink', () => {
  it('opens another site in a new tab that cannot reach back, and says so', () => {
    const html = renderToStaticMarkup(<SiteLink href="https://github.com/x">Source</SiteLink>);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('(opens in a new tab)');
  });

  it('keeps a page on this site in the same tab', () => {
    const html = renderToStaticMarkup(<SiteLink href="/privacy">Privacy</SiteLink>);
    expect(html).not.toContain('target=');
    expect(html).not.toContain('opens in a new tab');
  });

  it('leaves a mail link alone', () => {
    const html = renderToStaticMarkup(<SiteLink href="mailto:a@b.co">Mail</SiteLink>);
    expect(html).not.toContain('target=');
  });

  it('passes the class and the children through', () => {
    const html = renderToStaticMarkup(
      <SiteLink href="https://example.com" className="x">
        <b>Go</b>
      </SiteLink>,
    );
    expect(html).toContain('class="x"');
    expect(html).toContain('<b>Go</b>');
  });
});

describe('every outbound link in the site config opens in a new tab', () => {
  const external = [
    ...Object.values(siteConfig.footerLinks)
      .flat()
      .map((link) => link.href),
    siteConfig.repoUrl,
    siteConfig.releasesUrl,
    siteConfig.issuesUrl,
    siteConfig.goodFirstIssuesUrl,
    siteConfig.contributingUrl,
    siteConfig.securityUrl,
    siteConfig.licenseUrl,
    siteConfig.maltUrl,
    ...siteConfig.socials.map((social) => social.href),
  ].filter((href) => isExternal(href));

  it('has outbound links to check', () => {
    expect(external.length).toBeGreaterThan(8);
  });

  it.each(external)('%s', (href) => {
    const html = renderToStaticMarkup(<SiteLink href={href}>x</SiteLink>);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('noopener noreferrer');
  });
});

describe('MaltLink', () => {
  it('says Support by default and Show your Support when asked', () => {
    expect(renderToStaticMarkup(<MaltLink />)).toContain('<span>Support</span>');
    expect(renderToStaticMarkup(<MaltLink label="Show your Support" icon="heart" />)).toContain(
      '<span>Show your Support</span>',
    );
  });

  it('draws an icon beside the words and opens the owner page in a new tab', () => {
    const html = renderToStaticMarkup(<MaltLink />);
    expect(html).toContain('<svg');
    expect(html).toContain('href="https://buymeamalt.com/@oyedokunken"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('uses a different icon for the heart and for the hand', () => {
    const heart = renderToStaticMarkup(<MaltLink icon="heart" />);
    const hand = renderToStaticMarkup(<MaltLink icon="hand" />);
    expect(heart).not.toBe(hand);
  });
});

describe('BuiltBy', () => {
  const html = renderToStaticMarkup(<BuiltBy />);

  it('shows the handle as a button that opens a card', () => {
    expect(html).toContain('Built by');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>@oyedokunken<\/button>/);
    expect(html).toContain('aria-controls=');
  });

  it('keeps the card closed until it is asked for', () => {
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*role="group"|role="group"[^>]*hidden=""/);
  });

  it('shows only the five icons, with no name or handle caption in the card', () => {
    const card = html.slice(html.indexOf('role="group"'));
    expect(card).not.toContain('Oyedokun Kehinde');
    expect(card.match(/<a /g)).toHaveLength(5);
  });

  it('links the five profiles, in order, in new tabs', () => {
    const links = [...html.matchAll(/<a href="([^"]+)"[^>]*aria-label="([^"]+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(links).toEqual([
      ['https://www.oyedokun.dev/', 'Website (opens in a new tab)'],
      ['https://github.com/oyedokunken/', 'GitHub (opens in a new tab)'],
      ['https://www.linkedin.com/in/oyedokunken', 'LinkedIn (opens in a new tab)'],
      ['https://www.instagram.com/oyedokunken/', 'Instagram (opens in a new tab)'],
      ['https://x.com/oyedokunken_', 'X (opens in a new tab)'],
    ]);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(5);
  });

  it('puts each name and an external link icon in its tooltip', () => {
    for (const name of ['Website', 'GitHub', 'LinkedIn', 'Instagram', 'X']) {
      expect(html).toMatch(new RegExp(`aria-hidden="true">${name}<svg`));
    }
  });
});

describe('TooltipLink', () => {
  const html = renderToStaticMarkup(
    <TooltipLink label="GitHub" href="https://github.com/oyedokunken/">
      icon
    </TooltipLink>,
  );

  it('starts with the tooltip hidden', () => {
    expect(html).toContain('data-visible="false"');
  });

  it('names the link for screen readers without reading the tooltip twice', () => {
    expect(html).toContain('aria-label="GitHub (opens in a new tab)"');
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>GitHub/);
  });
});

describe('the feature cards', () => {
  const html = renderToStaticMarkup(<Features />);

  it('number each card out of eight, above its heading', () => {
    for (let index = 1; index <= 8; index += 1) {
      expect(html).toContain(`<span>0${String(index)}</span>/08`);
    }
    expect(html.indexOf('<span>01</span>/08')).toBeLessThan(html.indexOf('<h3>Auto zoom</h3>'));
    expect(html.indexOf('<span>08</span>/08')).toBeLessThan(html.indexOf('<h3>Shortcuts</h3>'));
  });

  it('hides the numbers from assistive technology, because the cards are already in order', () => {
    expect(html).toMatch(/aria-hidden="true"><span>01<\/span>\/08/);
  });

  it('shows all eight as cards, in order', () => {
    const titles = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles.slice(0, 8)).toEqual([
      'Auto zoom',
      'One screen',
      'Cursor',
      'Face camera',
      'Backgrounds',
      'Trim and cut',
      'Export',
      'Shortcuts',
    ]);
  });

  it('gives each card its place in the stack', () => {
    for (let index = 0; index < 8; index += 1) {
      expect(html).toContain(`--i:${String(index)}`);
    }
  });
});
