import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DownloadButton } from '@/components/download-button';

describe('DownloadButton on the server', () => {
  const html = renderToStaticMarkup(<DownloadButton href="#download" />);

  it('reads a neutral Download that works for everyone', () => {
    expect(html).toContain('>Download</span>');
    expect(html).not.toContain('Download for macOS');
    expect(html).not.toContain('Download for Linux');
  });

  it('links to where it was told to, so it works without JavaScript', () => {
    expect(html).toContain('href="#download"');
  });

  it('reserves the width of the longest label with a hidden twin', () => {
    expect(html).toContain('Download for Windows</span>');
    expect(html).toContain('aria-hidden="true"><svg');
  });

  it('hides the decorative icon from assistive technology', () => {
    expect(html).toContain('aria-hidden="true"');
  });
});
