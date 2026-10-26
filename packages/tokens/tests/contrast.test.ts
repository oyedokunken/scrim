import { describe, expect, it } from 'vitest';
import { blendOver, contrastRatio, palette, relativeLuminance } from '../src/index';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('accepts lower case hex', () => {
    expect(relativeLuminance('#fbf8f4')).toBeCloseTo(relativeLuminance('#FBF8F4'), 10);
  });

  it('rejects malformed colors', () => {
    expect(() => relativeLuminance('red')).toThrow(/6 digit hex/);
    expect(() => relativeLuminance('#fff')).toThrow(/6 digit hex/);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio(palette.green, palette.green)).toBe(1);
  });
});

describe('blendOver', () => {
  it('returns the background at 0 and the foreground at 1', () => {
    expect(blendOver(palette.black, palette.butter, 0)).toBe(palette.butter);
    expect(blendOver(palette.black, palette.butter, 1)).toBe(palette.black);
  });

  it('mixes in sRGB', () => {
    expect(blendOver('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('rejects an opacity outside 0 to 1', () => {
    expect(() => blendOver(palette.black, palette.butter, 1.2)).toThrow(RangeError);
    expect(() => blendOver(palette.black, palette.butter, -0.1)).toThrow(RangeError);
  });
});
