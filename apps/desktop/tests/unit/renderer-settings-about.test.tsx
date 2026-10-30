import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutCard, formatDay, formatMoment } from '../../src/renderer/src/settings/about-card';

describe('the about card', () => {
  it('shows the short line, the facts and the privacy note', () => {
    const html = renderToStaticMarkup(<AboutCard onOpenLink={() => undefined} />);
    expect(html).toContain(
      'A free, open source screen recorder and screenshot tool for Windows, macOS and Linux.',
    );
    for (const label of [
      'App name',
      'Version',
      'License',
      'Release date',
      'Last updated',
      'Computer name',
      'Operating system',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('It is never sent anywhere or saved in the logs.');
    expect(html).toContain('Source code');
    expect(html).toContain('About the FFmpeg license');
    expect(html).toContain('@oyedokunken');
    expect(html).toContain('LGPL version 3');
  });

  it('does not repeat the app name in every sentence', () => {
    const html = renderToStaticMarkup(<AboutCard onOpenLink={() => undefined} />);
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text.match(/Scrim/g) ?? []).toHaveLength(0);
  });

  it('formats dates for the reader and passes odd text through', () => {
    expect(formatDay('2026-10-30', 'en-US')).toBe('October 30, 2026');
    expect(formatDay('soon')).toBe('soon');
    expect(formatMoment('not a time')).toBe('not a time');
    expect(formatMoment('2026-10-30T10:00:00.000Z', 'en-US')).toContain('2026');
  });
});
