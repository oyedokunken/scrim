import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blendOver, contrastRatio, palette } from '../src/index';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function cssValue(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`--${name} is not defined as a hex value in tokens.css`);
  }
  return value.toUpperCase();
}

describe('palette and tokens.css', () => {
  it('stay in sync', () => {
    expect(cssValue('scrim-green')).toBe(palette.green);
    expect(cssValue('scrim-butter')).toBe(palette.butter);
    expect(cssValue('scrim-black')).toBe(palette.black);
    expect(cssValue('scrim-white')).toBe(palette.white);
    expect(cssValue('scrim-record')).toBe(palette.record);
  });

  it('contains no hex value outside the palette', () => {
    const allowed = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));
    const found = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const stray = found.filter((hex) => !allowed.has(hex.toUpperCase()));
    expect(stray).toEqual([]);
  });

  it('derives greys with color-mix from the black', () => {
    expect(css).toMatch(/--scrim-text-secondary:\s*color-mix\(in srgb, var\(--scrim-black\) 72%/);
    expect(css).toMatch(/--scrim-border:\s*color-mix\(in srgb, var\(--scrim-black\) 14%/);
    expect(css).toMatch(/--scrim-fill-quiet:\s*color-mix\(in srgb, var\(--scrim-black\) 8%/);
  });
});

describe('contrast floors from the design system', () => {
  const { green, butter, black, white } = palette;
  const secondaryOnButter = blendOver(black, butter, 0.72);

  it.each([
    ['black on white', black, white, 21],
    ['black on butter', black, butter, 19.8],
    ['green on white', green, white, 9.5],
    ['green on butter', green, butter, 9],
    ['white on green', white, green, 9.5],
    ['butter on green', butter, green, 9],
    ['secondary text on butter', secondaryOnButter, butter, 9],
  ])('%s is at least %f', (_label, foreground, background, floor) => {
    // Floors are the ratios measured to one decimal, so compare after rounding.
    expect(Math.round(contrastRatio(foreground, background) * 10) / 10).toBeGreaterThanOrEqual(
      floor,
    );
  });

  it('clears WCAG AA for normal text on every pair above', () => {
    const pairs: [string, string][] = [
      [black, white],
      [black, butter],
      [green, white],
      [green, butter],
      [white, green],
      [butter, green],
      [secondaryOnButter, butter],
    ];
    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the signal red readable on black and clear enough as a graphic on white', () => {
    expect(contrastRatio(palette.record, black)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(white, palette.record)).toBeGreaterThanOrEqual(3);
  });

  it('documents that black on green and green on black fail AA, so neither is used for text', () => {
    expect(contrastRatio(black, green)).toBeLessThan(4.5);
    expect(contrastRatio(green, black)).toBeLessThan(4.5);
  });
});
