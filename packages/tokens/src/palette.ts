/** The four brand colors. Greys are derived from black in CSS and never listed here. */
export const palette = {
  green: '#105D64',
  butter: '#FBF7F4',
  black: '#2C2322',
  white: '#FFFFFF',
} as const;

export type PaletteName = keyof typeof palette;
