import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DownloadModal } from '@/components/download/download-modal';
import { DownloadProvider, DownloadTrigger } from '@/components/download/download-provider';

const css = readFileSync(
  new URL('../../src/components/download/download-modal.module.css', import.meta.url),
  'utf8',
);

describe('DownloadModal markup', () => {
  const html = renderToStaticMarkup(
    <DownloadModal open={false} initialOs={undefined} onClose={() => undefined} />,
  );

  it('is the browser dialog, closed until it is opened', () => {
    expect(html).toContain('<dialog');
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toMatch(/<dialog[^>]*aria-labelledby=/);
  });

  it('asks Before you download and says why', () => {
    expect(html).toContain('Before you download');
    expect(html).toMatch(/We track the number of downloads, so let.s get to know you\./);
  });

  it('has placeholders on the name and the email', () => {
    expect(html).toContain('placeholder="Ada Lovelace"');
    expect(html).toContain('placeholder="you@example.com"');
  });

  it('puts the name and the email in one row, and the system choice below', () => {
    expect(html.indexOf('Your name')).toBeLessThan(html.indexOf('Your email'));
    expect(html.indexOf('Your email')).toBeLessThan(html.indexOf('Your machine'));
    expect(html).toMatch(/class="[^"]*row[^"]*"/);
  });

  it('gives the two fields half the row each, stacking on a small screen', () => {
    expect(css).toMatch(/\.row \{[^}]*display: grid/);
    expect(css).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(min-width: 34rem\)/);
  });

  it('uses the form library for validation, so there is no HTML required attribute', () => {
    expect(html).toContain('noValidate');
    expect(html).not.toMatch(/\srequired[\s=>]/);
    expect(html).not.toMatch(/\spattern=/);
  });

  it('offers all three systems as radio buttons with logos', () => {
    expect(html.match(/type="radio"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    for (const name of ['Windows', 'macOS', 'Linux']) {
      expect(html).toContain(`<span>${name}</span>`);
    }
  });

  it('leaves the updates box unticked and the honeypot out of sight and out of the tab order', () => {
    expect(html).toMatch(/type="checkbox"[^>]*(?!checked)/);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*><label>Website<input[^>]*tabindex="-1"/);
  });

  it('has a Start download button and the privacy line with a link that opens in a new tab', () => {
    expect(html).toContain('Start download');
    expect(html).toContain('Read the privacy policy');
    expect(html).toMatch(/href="\/privacy"[^>]*target="_blank"/);
  });

  it('has a close button with a real name', () => {
    expect(html).toContain('aria-label="Close"');
  });
});

describe('the download buttons', () => {
  it('are plain links to the Releases page without JavaScript', () => {
    const html = renderToStaticMarkup(
      <DownloadProvider>
        <DownloadTrigger os="macos">Get it</DownloadTrigger>
      </DownloadProvider>,
    );
    expect(html).toContain('href="https://github.com/oyedokunken/scrim/releases"');
    expect(html).toContain('data-download-trigger');
    expect(html).toContain('>Get it<');
  });

  it('do not render the dialog until someone opens it, keeping it out of the first load', () => {
    const html = renderToStaticMarkup(
      <DownloadProvider>
        <p>page</p>
      </DownloadProvider>,
    );
    expect(html).not.toContain('<dialog');
  });
});
