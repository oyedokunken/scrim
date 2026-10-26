import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LogoMark } from '@/components/logo';
import { MARK } from '@/lib/brand';
import { MarkSvg } from '@/lib/mark-svg';

const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const GREEN = '#004E52';
const BUTTER = '#FBF8F4';
const BLACK = '#000000';

/** Files that draw the mark itself. Inside these, only green and butter may appear. */
const MARK_FILES = ['src/app/icon.svg', 'src/lib/mark-svg.tsx', 'src/components/logo.tsx'];

/** Every file that renders the mark somewhere: favicon, icons, Apple icon, cards, header. */
const MARK_CONSUMERS = [
  ...MARK_FILES,
  'src/lib/brand.ts',
  'src/og/brand-card.tsx',
  'src/og/icon-image.tsx',
  'src/app/opengraph-image.tsx',
  'src/app/twitter-image.tsx',
  'src/app/apple-icon.tsx',
  'src/app/favicon.ico/route.ts',
  'src/app/icon-192.png/route.ts',
  'src/app/icon-512.png/route.ts',
  'src/app/icon-maskable-512.png/route.ts',
  'src/app/manifest.ts',
];

const hexes = (text: string) =>
  (text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toUpperCase());
const WHITE = /#fff(?:fff)?\b|\bwhite\b|scrim-white|currentColor/i;

describe('the logo mark', () => {
  it.each(MARK_FILES)('%s uses only green and butter', (file) => {
    const found = new Set(hexes(read(file)));
    for (const hex of found) {
      expect([GREEN, BUTTER]).toContain(hex);
    }
  });

  it.each(MARK_CONSUMERS)('%s contains no white', (file) => {
    expect(read(file)).not.toMatch(WHITE);
  });

  it.each(['src/og/brand-card.tsx', 'src/og/icon-image.tsx'])(
    '%s uses only palette colors outside the mark',
    (file) => {
      for (const hex of new Set(hexes(read(file)))) {
        expect([GREEN, BUTTER, BLACK]).toContain(hex);
      }
    },
  );

  it('keeps the approved geometry in the static icon', () => {
    const svg = read('src/app/icon.svg');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain(`<rect width="32" height="32" rx="8" fill="${GREEN}"/>`);
    expect(svg).toContain(`d="${MARK.brackets}"`);
    expect(svg).toContain(`stroke="${BUTTER}" stroke-width="2" stroke-linecap="round"`);
    expect(svg).toContain(`<circle cx="16" cy="16" r="3.5" fill="${BUTTER}"/>`);
  });

  it('draws the literal mark in green and butter only', () => {
    const html = renderToStaticMarkup(<MarkSvg size={96} />);
    expect(new Set(hexes(html))).toEqual(new Set([GREEN, BUTTER]));
    expect(html).toContain('rx="8"');
    expect(html).toContain(MARK.brackets);
  });

  it('draws a full bleed square for maskable icons with square corners', () => {
    const html = renderToStaticMarkup(<MarkSvg size={512} fullBleed />);
    expect(html).toContain('rx="0"');
    expect(new Set(hexes(html))).toEqual(new Set([GREEN, BUTTER]));
  });

  it('draws the component with the two brand variables and nothing else', () => {
    const html = renderToStaticMarkup(<LogoMark />);
    expect(html).toContain('fill="var(--scrim-green)"');
    expect(html).toContain('stroke="var(--scrim-butter)"');
    expect(html).toContain('fill="var(--scrim-butter)"');
    expect(html).not.toMatch(WHITE);
    expect(hexes(html)).toEqual([]);
    expect(html).toContain('aria-hidden="true"');
  });
});
