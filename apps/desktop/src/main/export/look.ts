import { smoothnessToEaseMs } from '@scrim/core/render';
import type { RenderStyle } from '@scrim/core/render';
import type { Settings } from '../../shared/settings';
import type { CursorPaint, Rgba } from './compositor';

const PADDING_SHARE: Record<Settings['backgroundPadding'], number> = {
  none: 0,
  small: 0.03,
  medium: 0.06,
  large: 0.1,
};

const RADIUS_SHARE: Record<Settings['backgroundCorners'], number> = {
  square: 0,
  soft: 0.025,
  round: 0.05,
};

/** The look the person chose in Settings, as the render model wants it. */
export function styleFromSettings(settings: Settings): RenderStyle {
  return {
    cursor: { style: settings.cursorStyle },
    zoom: {
      enabled: settings.zoomOn,
      maxZoom: settings.zoomLevel,
      holdMs: settings.holdAfterClickMs,
      easeMs: smoothnessToEaseMs(settings.smoothness),
    },
    background:
      settings.backgroundId === 'none'
        ? { spec: { kind: 'none' } }
        : {
            spec: { kind: 'preset', id: settings.backgroundId },
            paddingShare: PADDING_SHARE[settings.backgroundPadding],
            radiusShare: RADIUS_SHARE[settings.backgroundCorners],
          },
    bubble: {
      visible: settings.cameraOn,
      corner: settings.bubbleCorner,
      size: settings.bubbleSize,
      shape: settings.bubbleShape,
    },
  };
}

const MIC_GAIN: Record<Settings['micVolume'], number> = {
  quieter: 0.6,
  normal: 1,
  louder: 1.8,
};

export function micGainFor(volume: Settings['micVolume']): number {
  return MIC_GAIN[volume];
}

function rgba(hex: string, alpha: number): Rgba {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/** Halo and ripple colours for the halo colour setting. Brand is the butter disc with a green ring. */
export function cursorPaintFor(color: Settings['haloColor']): CursorPaint {
  switch (color) {
    case 'green':
      return {
        haloFill: rgba('#004E52', 0.22),
        haloRing: rgba('#004E52', 0.95),
        rippleRing: rgba('#004E52', 0.85),
      };
    case 'white':
      return {
        haloFill: rgba('#FFFFFF', 0.3),
        haloRing: rgba('#FFFFFF', 0.95),
        rippleRing: rgba('#FFFFFF', 0.9),
      };
    case 'black':
      return {
        haloFill: rgba('#000000', 0.16),
        haloRing: rgba('#000000', 0.85),
        rippleRing: rgba('#000000', 0.8),
      };
    case 'brand':
      return {
        haloFill: rgba('#FBF8F4', 0.35),
        haloRing: rgba('#004E52', 0.9),
        rippleRing: rgba('#004E52', 0.8),
      };
  }
}
