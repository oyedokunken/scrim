type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  const digits = match?.[1];
  if (digits === undefined) {
    throw new Error(`Expected a 6 digit hex color, received "${hex}".`);
  }
  const value = Number.parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  const part = (channel: number) =>
    Math.round(Math.min(255, Math.max(0, channel)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a 6 digit hex color, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two hex colors, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Mixes `foreground` over `background` at the given opacity (0 to 1) in sRGB.
 * This matches `color-mix(in srgb, fg <opacity>, bg)`, so tests can measure the CSS greys.
 */
export function blendOver(foreground: string, background: string, opacity: number): string {
  if (opacity < 0 || opacity > 1) {
    throw new RangeError(`Opacity must be between 0 and 1, received ${opacity}.`);
  }
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  return toHex([
    fg[0] * opacity + bg[0] * (1 - opacity),
    fg[1] * opacity + bg[1] * (1 - opacity),
    fg[2] * opacity + bg[2] * (1 - opacity),
  ]);
}
