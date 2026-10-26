import localFont from 'next/font/local';

// The font file comes from @fontsource-variable/urbanist and is served from our own origin.
// Latin only. next/font preloads it and builds a size matched fallback so the swap does not shift.
export const urbanist = localFont({
  src: '../../node_modules/@fontsource-variable/urbanist/files/urbanist-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-urbanist',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  adjustFontFallback: 'Arial',
});
