import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MARK, MARK_COLORS, palette } from '../src/index';
import { parseMark, readMark, renderMarkModule } from '../scripts/mark-source.mts';

const brandDir = new URL('../brand/', import.meta.url);
const mainSvg = new URL('scrim-mark.svg', brandDir);
const smallDir = new URL('small/', brandDir);
const smallFiles = readdirSync(smallDir).filter((name) => name.endsWith('.svg'));
const allowed = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));
const hexes = (text: string) =>
  (text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toUpperCase());

describe('the brand mark svg', () => {
  it('uses only palette colors, green and butter', () => {
    const found = hexes(readFileSync(mainSvg, 'utf8'));
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((hex) => !allowed.has(hex))).toEqual([]);
    expect(new Set(found)).toEqual(new Set([palette.green, palette.butter]));
  });

  it('is what src/mark.ts was generated from', () => {
    const generated = readFileSync(new URL('../src/mark.ts', import.meta.url), 'utf8');
    expect(generated).toBe(renderMarkModule(readMark(mainSvg)));
  });

  it('gives the landing page its colors and geometry', () => {
    expect(MARK_COLORS).toEqual({ tile: palette.green, glyph: palette.butter });
    expect(MARK.viewBox).toBe('0 0 32 32');
  });

  it('matches the landing favicon svg byte for byte', () => {
    const favicon = new URL('../../../apps/landing/src/app/icon.svg', import.meta.url);
    expect(readFileSync(favicon, 'utf8')).toBe(readFileSync(mainSvg, 'utf8'));
  });
});

describe('the small size variants', () => {
  it('covers 16, 20 and 24', () => {
    expect(smallFiles.sort()).toEqual([
      'scrim-mark-16.svg',
      'scrim-mark-20.svg',
      'scrim-mark-24.svg',
    ]);
  });

  it.each(smallFiles)('%s uses only palette colors and sits on its own pixel grid', (name) => {
    const svg = readFileSync(new URL(name, smallDir), 'utf8');
    expect(hexes(svg).filter((hex) => !allowed.has(hex))).toEqual([]);
    const size = Number(/scrim-mark-(\d+)\.svg/.exec(name)?.[1]);
    const mark = parseMark(svg);
    expect(mark.size).toBe(size);
    expect(mark.colors).toEqual({ tile: palette.green, glyph: palette.butter });
  });
});

describe('parseMark', () => {
  it('rejects a file without the expected shapes', () => {
    expect(() => parseMark('<svg viewBox="0 0 32 32"></svg>')).toThrow(/rect/);
  });

  it('rejects a viewBox that does not match the tile', () => {
    const svg = readFileSync(mainSvg, 'utf8').replace('viewBox="0 0 32 32"', 'viewBox="0 0 64 64"');
    expect(() => parseMark(svg)).toThrow(/viewBox/);
  });
});
