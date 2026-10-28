import { describe, expect, it } from 'vitest';
import { copyMessage, copyText } from '@/lib/copy-text';
import { FAQ } from '@/lib/faq';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/page-metadata';
import { formatPrivacyDate, PRIVACY_LAST_UPDATED, RETENTION_STATEMENT } from '@/lib/privacy';
import { formatReleaseDate } from '@/lib/release-date';
import { SYSTEMS } from '@/lib/systems';

describe('FAQ', () => {
  it('has twelve questions so two columns hold six each', () => {
    expect(FAQ).toHaveLength(12);
  });

  it('asks each question once and answers it in full sentences', () => {
    expect(new Set(FAQ.map((item) => item.question)).size).toBe(FAQ.length);
    for (const item of FAQ) {
      expect(item.question.endsWith('?')).toBe(true);
      expect(item.answer.length).toBeGreaterThan(40);
      expect(item.answer.endsWith('.')).toBe(true);
    }
  });

  it('states no maximum resolution, which the owner has not confirmed', () => {
    const text = FAQ.map((item) => item.answer).join(' ');
    expect(text).not.toMatch(/\b(4k|8k|2160|3840|1440p|1080p|720p)\b/i);
  });

  it('answers the two questions people ask first: sign up and the cloud', () => {
    const find = (text: string) => FAQ.find((item) => item.question === text)?.answer ?? '';
    expect(find('Do I need to sign up?')).toMatch(/^No./);
    expect(find('Are my videos saved to the cloud?')).toMatch(/^No./);
    expect(find('Are my videos saved to the cloud?')).toMatch(/folder on your computer/);
  });

  it('no longer says the app cannot be downloaded, because the page launches with it', () => {
    const text = FAQ.map((item) => item.answer + item.question).join(' ');
    expect(text).not.toMatch(/not yet|first release|in development/i);
  });
});

describe('serializeJsonLd', () => {
  it('cannot be closed by a script tag in the data', () => {
    const hostile = { name: '</script><script>alert(1)</script>', note: 'a & b > c' };
    const text = serializeJsonLd(hostile);
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text).not.toContain('&');
    expect(text).not.toContain('</script');
  });

  it('still parses back to the same data', () => {
    const data = { name: '</script> & <b>', nested: { list: ['a<b', 'c>d'] } };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('escapes the line separators that break older scripts', () => {
    const data = { text: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` };
    const text = serializeJsonLd(data);
    expect(text).not.toContain(String.fromCharCode(0x2028));
    expect(text).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(text)).toEqual(data);
  });

  it('leaves plain data alone', () => {
    expect(serializeJsonLd({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
  });
});

describe('softwareApplicationJsonLd', () => {
  const data = softwareApplicationJsonLd({
    name: 'Scrim',
    description: 'A screen recorder.',
    siteUrl: 'https://scrim.example',
    licenseUrl: 'https://github.com/oyedokunken/scrim/blob/main/LICENSE',
    author: { name: 'Oyedokun Kehinde', url: 'https://www.oyedokun.dev/' },
  });

  it('describes a free multimedia app for Windows', () => {
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.operatingSystem).toBe('Windows');
    expect(data.applicationCategory).toBe('MultimediaApplication');
    expect(data.offers.price).toBe('0');
  });

  it('points the license at the repository and names the author', () => {
    expect(data.license).toBe('https://github.com/oyedokunken/scrim/blob/main/LICENSE');
    expect(data.author.name).toBe('Oyedokun Kehinde');
  });
});

describe('pageMetadata', () => {
  const metadata = pageMetadata({
    title: 'Privacy policy',
    description: 'About privacy.',
    path: '/privacy',
  });

  it('sets the canonical path and the title and description', () => {
    expect(metadata.alternates?.canonical).toBe('/privacy');
    expect(metadata.title).toBe('Privacy policy');
    expect(metadata.description).toBe('About privacy.');
  });

  it('restates the Open Graph and Twitter tags, which replace the layout ones', () => {
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Scrim',
      title: 'Privacy policy | Scrim',
      url: '/privacy',
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });
});

describe('the privacy constants', () => {
  it('has an ISO last updated date that formats for people', () => {
    expect(PRIVACY_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatPrivacyDate('2026-10-26')).toBe('26 October 2026');
    expect(formatPrivacyDate()).toBe(formatPrivacyDate(PRIVACY_LAST_UPDATED));
  });

  it('rejects a date it cannot read', () => {
    expect(() => formatPrivacyDate('soon')).toThrow(RangeError);
  });

  it('uses the neutral retention wording until the owner sets a period', () => {
    expect(RETENTION_STATEMENT).toBe(
      'We keep download records only as long as we need them to count downloads and send release notices. You can ask us to delete yours at any time.',
    );
    expect(RETENTION_STATEMENT).not.toMatch(/\d+\s*(day|month|year)/i);
  });
});

describe('formatReleaseDate', () => {
  it('formats an ISO date in UTC for people', () => {
    expect(formatReleaseDate('2026-11-02T09:30:00Z')).toBe('2 November 2026');
    expect(formatReleaseDate('2026-11-02T23:59:59Z')).toBe('2 November 2026');
  });

  it('returns null for a missing or unreadable date', () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate('not a date')).toBeNull();
  });
});

describe('SYSTEMS', () => {
  it('lists Windows, macOS and Linux in that order', () => {
    expect(SYSTEMS.map((system) => system.name)).toEqual(['Windows', 'macOS', 'Linux']);
  });

  it('gives each system first run help', () => {
    for (const system of SYSTEMS) {
      expect(system.help.length).toBeGreaterThan(0);
    }
  });

  it('covers SmartScreen for Windows and says macOS and Linux are not out yet', () => {
    const help = (name: string) =>
      SYSTEMS.find((system) => system.name === name)?.help.join(' ') ?? '';
    expect(help('Windows')).toMatch(/SmartScreen/);
    expect(help('Windows')).toMatch(/More info, then Run anyway/);
    expect(help('macOS')).toMatch(/no Mac version yet/);
    expect(help('Linux')).toMatch(/no Linux version yet/);
  });

  it('has an installer for Windows only in version 1', () => {
    expect(SYSTEMS.filter((system) => system.available).map((system) => system.name)).toEqual([
      'Windows',
    ]);
  });
});

describe('copyText', () => {
  const written: string[] = [];
  const working = {
    writeText: (text: string) => {
      written.push(text);
      return Promise.resolve();
    },
  };
  const blocked = { writeText: () => Promise.reject(new Error('NotAllowedError')) };

  it('copies with the clipboard and does not touch the fallback', async () => {
    let selected = false;
    const result = await copyText('hello', working, () => {
      selected = true;
      return true;
    });
    expect(result).toBe('copied');
    expect(written).toEqual(['hello']);
    expect(selected).toBe(false);
  });

  it('falls back to selecting the text when the clipboard is blocked', async () => {
    expect(await copyText('x', blocked, () => true)).toBe('selected');
  });

  it('falls back when there is no clipboard at all', async () => {
    expect(await copyText('x', undefined, () => true)).toBe('selected');
  });

  it('says it failed when nothing could be selected either', async () => {
    expect(await copyText('x', blocked, () => false)).toBe('failed');
  });

  it('has a message for every outcome, including none', () => {
    expect(copyMessage('copied')).toBe('Copied');
    expect(copyMessage('selected')).toMatch(/Ctrl\+C/);
    expect(copyMessage('failed')).toMatch(/Could not copy/);
    expect(copyMessage(null)).toBe('');
  });
});
