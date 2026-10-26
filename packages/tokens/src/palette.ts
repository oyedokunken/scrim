/**
 * The brand colors, and one signal red for recording indicators. Greys are derived from black in
 * CSS and never listed here.
 */
export const palette = {
  green: '#004E52',
  butter: '#FBF8F4',
  black: '#000000',
  white: '#FFFFFF',
  record: '#FF3B30',
} as const;

export type PaletteName = keyof typeof palette;
