import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { MarkSvg } from '@/lib/mark-svg';
import { siteConfig } from '@/site.config';

const SIZE = { width: 1200, height: 630 } as const;

async function loadFont(weight: 600 | 800): Promise<ArrayBuffer> {
  // The renderer needs TTF, OTF or WOFF. It cannot read WOFF2 or variable fonts, so this is the
  // static Urbanist package. A missing file throws, which fails the build instead of silently
  // falling back to a default font.
  const file = path.resolve(
    process.cwd(),
    `node_modules/@fontsource/urbanist/files/urbanist-latin-${weight}-normal.woff`,
  );
  const buffer = await readFile(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/** The Open Graph and Twitter card. Both routes render exactly this. */
export async function renderBrandCard(): Promise<ImageResponse> {
  const [bold, semibold] = await Promise.all([loadFont(800), loadFont(600)]);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#FBF7F4',
        fontFamily: 'Urbanist',
      }}
    >
      <div style={{ display: 'flex' }}>
        <MarkSvg size={96} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: 132,
            fontWeight: 800,
            letterSpacing: -6,
            lineHeight: 1,
            color: '#2C2322',
          }}
        >
          {siteConfig.name}
        </div>
        <div style={{ marginTop: 20, fontSize: 44, fontWeight: 600, color: '#105D64' }}>
          {siteConfig.tagline}
        </div>
      </div>
    </div>,
    {
      ...SIZE,
      fonts: [
        { name: 'Urbanist', data: bold, weight: 800, style: 'normal' },
        { name: 'Urbanist', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
