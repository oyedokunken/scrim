import { ImageResponse } from 'next/og';
import { MarkSvg } from '@/lib/mark-svg';
import { loadFont } from './brand-card';

/** Pixel size of the full logo at 2x, so it stays sharp on high density screens. */
const FULL_LOGO = { width: 280, height: 88 } as const;

/** The mark and the Scrim wordmark side by side, on a transparent background. */
export async function renderFullLogo(): Promise<ImageResponse> {
  const bold = await loadFont(800);
  return new ImageResponse(
    <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Urbanist' }}>
      <MarkSvg size={FULL_LOGO.height} />
      <div
        style={{
          marginLeft: 24,
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1,
          color: '#000000',
        }}
      >
        Scrim
      </div>
    </div>,
    {
      ...FULL_LOGO,
      fonts: [{ name: 'Urbanist', data: bold, weight: 800, style: 'normal' }],
    },
  );
}
