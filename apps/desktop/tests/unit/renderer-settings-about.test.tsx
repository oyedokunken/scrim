import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatDay, formatMoment } from '../../src/renderer/src/format';
import { AboutCard } from '../../src/renderer/src/settings/about-card';
import { AttributionsCard } from '../../src/renderer/src/settings/attributions-card';

describe('the about card', () => {
  it('shows the sentence and the four facts, with an icon beside the title', () => {
    const html = renderToStaticMarkup(<AboutCard />);
    expect(html).toContain(
      'Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and Linux.',
    );
    for (const label of ['App name', 'Version', 'License', 'Release date']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('lucide-info');
  });

  it('has no Last updated row, no credits and none of the removed notes', () => {
    const html = renderToStaticMarkup(<AboutCard />);
    expect(html).not.toContain('Last updated');
    expect(html).not.toContain('Shown only here');
    for (const text of ['FFmpeg', 'LGPL', 'Source code', '@oyedokunken', 'The developer']) {
      expect(html).not.toContain(text);
    }
  });

  it('names the app once, in the first sentence', () => {
    const html = renderToStaticMarkup(<AboutCard />);
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text.match(/Scrim/g) ?? []).toHaveLength(1);
  });

  it('keeps the credits for the Attributions card', () => {
    const html = renderToStaticMarkup(<AboutCard />);
    for (const text of ['FFmpeg', 'LGPL', 'Source code', '@oyedokunken', 'The developer']) {
      expect(html).not.toContain(text);
    }
  });
});

describe('the attributions card', () => {
  const html = renderToStaticMarkup(<AttributionsCard onOpenLink={() => undefined} />);

  it('has an icon beside its title, the FFmpeg heading and the notice', () => {
    expect(html).toMatch(/<h2[^>]*><svg[^>]*lucide-scroll-text[^>]*>.*Attributions<\/h2>/s);
    expect(html).toContain('>FFmpeg</h3>');
    expect(html).toContain('Built under the LGPL version 3 and used unchanged.');
  });

  it('holds exactly one row of three buttons: Source code, FFmpeg and The developer', () => {
    const row = /<div class="set-links">(.*)<\/div><\/section>/s.exec(html)?.[1] ?? '';
    const labels = [...row.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((match) =>
      match[1]?.replace(/<[^>]+>/g, '').trim(),
    );
    expect(labels).toEqual(['Source code', 'FFmpeg', 'The developer']);
    expect(html).not.toContain('Built by');
    expect(html).not.toContain('About the FFmpeg license');
  });

  it('opens the developer website from The developer', () => {
    expect(html).toContain('The developer');
  });
});

describe('the credit line on the welcome screen', () => {
  it('still reads Built by with the handle', async () => {
    const { BuiltBy } = await import('../../src/renderer/src/shell/built-by');
    const credit = renderToStaticMarkup(<BuiltBy onOpenLink={() => undefined} />);
    expect(credit).toContain('Built by');
    expect(credit).toContain('@oyedokunken');
  });
});

describe('the date formats', () => {
  it('formats dates for the reader and passes odd text through', () => {
    expect(formatDay('2026-10-30', 'en-US')).toBe('October 30, 2026');
    expect(formatDay('soon')).toBe('soon');
    expect(formatMoment('not a time')).toBe('not a time');
    expect(formatMoment('2026-10-30T10:00:00.000Z', 'en-US')).toContain('2026');
  });

  it('writes a moment with a 12 hour clock and no seconds', () => {
    const text = formatMoment(new Date(2026, 9, 31, 0, 59, 52).getTime(), 'en-US');
    expect(text).toBe('October 31, 2026 at 12:59 AM');
    expect(formatMoment(new Date(2026, 9, 31, 13, 5).getTime(), 'en-US')).toBe(
      'October 31, 2026 at 1:05 PM',
    );
  });
});
