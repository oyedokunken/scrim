import { DEFAULT_BACKGROUND_ID, smoothnessToEaseMs } from '@scrim/core/render';
import type { RenderStyle } from '@scrim/core/render';
import { customBackgroundOf } from './backgrounds-contract';
import type { Settings } from './settings';

export const PADDING_SHARE: Record<Settings['backgroundPadding'], number> = {
  none: 0,
  small: 0.03,
  medium: 0.06,
  large: 0.1,
};

export const RADIUS_SHARE: Record<Settings['backgroundCorners'], number> = {
  square: 0,
  soft: 0.025,
  round: 0.05,
};

/**
 * The look the person chose in Settings, as the render model wants it. The editor preview and the
 * export both use it, so what is shown is what is saved.
 */
export function renderStyleFromSettings(
  settings: Settings,
  /** Where one of the person's own images is, or undefined when it is gone. Only the export knows paths. */
  imageOf?: (imageId: string) => string | undefined,
): RenderStyle {
  const custom = customBackgroundOf(settings.backgroundId);
  const imagePath = custom === null ? undefined : imageOf?.(custom);
  // A picture that was removed falls back to the default preset instead of a black frame.
  const backgroundId =
    custom !== null && imagePath === undefined && imageOf !== undefined
      ? DEFAULT_BACKGROUND_ID
      : settings.backgroundId;
  return {
    cursor: { style: settings.cursorStyle },
    zoom: {
      enabled: settings.zoomOn,
      maxZoom: settings.zoomLevel,
      holdMs: settings.holdAfterClickMs,
      easeMs: smoothnessToEaseMs(settings.smoothness),
    },
    background:
      backgroundId === 'none'
        ? { spec: { kind: 'none' } }
        : {
            spec:
              custom !== null && imagePath !== undefined
                ? { kind: 'image', path: imagePath }
                : { kind: 'preset', id: backgroundId },
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

export interface CssCursorPaint {
  haloFill: string;
  haloRing: string;
  /** Without the alpha, which fades with the ripple. */
  rippleRgb: string;
  rippleAlpha: number;
}

/** Halo and ripple colours for the halo colour setting, as canvas colour strings. */
export function cursorPaintCss(color: Settings['haloColor']): CssCursorPaint {
  switch (color) {
    case 'green':
      return {
        haloFill: 'rgba(0, 78, 82, 0.22)',
        haloRing: 'rgba(0, 78, 82, 0.95)',
        rippleRgb: '0, 78, 82',
        rippleAlpha: 0.85,
      };
    case 'white':
      return {
        haloFill: 'rgba(255, 255, 255, 0.3)',
        haloRing: 'rgba(255, 255, 255, 0.95)',
        rippleRgb: '255, 255, 255',
        rippleAlpha: 0.9,
      };
    case 'black':
      return {
        haloFill: 'rgba(0, 0, 0, 0.16)',
        haloRing: 'rgba(0, 0, 0, 0.85)',
        rippleRgb: '0, 0, 0',
        rippleAlpha: 0.8,
      };
    case 'brand':
      return {
        haloFill: 'rgba(251, 248, 244, 0.35)',
        haloRing: 'rgba(0, 78, 82, 0.9)',
        rippleRgb: '0, 78, 82',
        rippleAlpha: 0.8,
      };
  }
}
