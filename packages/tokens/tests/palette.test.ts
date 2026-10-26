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
  });

  it('contains no hex value outside the four palette colors', () => {
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
    ['black on white', black, white, 15.3],
    ['black on butter', black, butter, 14.4],
    ['green on white', green, white, 7.6],
    ['green on butter', green, butter, 7.1],
    ['white on green', white, green, 7.6],
    ['butter on green', butter, green, 7.1],
    ['secondary text on butter', secondaryOnButter, butter, 5.9],
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

  it('documents that black on green fails AA, so it is never used', () => {
    expect(contrastRatio(black, green)).toBeLessThan(4.5);
  });
});
