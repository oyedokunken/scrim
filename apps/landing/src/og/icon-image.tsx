import { ImageResponse } from 'next/og';
import { MarkSvg } from '@/lib/mark-svg';

interface IconOptions {
  /** Edge of the output square in pixels. */
  size: number;
  /** A full bleed green square, for maskable icons. */
  fullBleed?: boolean;
}

/** The mark alone, filling the whole image. */
export function renderIcon({ size, fullBleed = false }: IconOptions): ImageResponse {
  return new ImageResponse(<MarkSvg size={size} fullBleed={fullBleed} />, {
    width: size,
    height: size,
  });
}

/** The mark centered on butter with safe padding, for the Apple touch icon. */
export function renderPaddedIcon(size: number): ImageResponse {
  const mark = Math.round(size * 0.69);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FBF7F4',
      }}
    >
      <MarkSvg size={mark} />
    </div>,
    { width: size, height: size },
  );
}
