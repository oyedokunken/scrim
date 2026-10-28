import type { Frame } from '../input/types';

/**
 * Every default the render model uses lives here, so a look can be tuned in one place. Sizes that
 * depend on the picture are given for a frame 1080 pixels tall and scaled by `unit`.
 */

/** Height of the reference frame that the pixel sizes below are written for. */
export const REFERENCE_HEIGHT = 1080;

/** Scales a size given for a 1080 pixel tall frame to the real frame. */
export function unit(frame: Frame): number {
  return frame.height / REFERENCE_HEIGHT;
}

export type CursorStyle = 'halo-ripples' | 'halo' | 'ripples' | 'off';

/**
 * Halo and ripple look. The halo is a butter disc with a green ring, which shows on both dark and
 * light screens and stays inside the brand palette. It is not the reference app's yellow.
 */
export const CURSOR_DEFAULTS = {
  style: 'halo-ripples' as CursorStyle,
  haloRadius: 26,
  haloFill: 'rgba(251, 248, 244, 0.35)',
  haloRing: 'rgba(0, 78, 82, 0.9)',
  haloRingWidth: 3,
  rippleDurationMs: 600,
  rippleStartRadius: 12,
  rippleEndRadius: 64,
  rippleColor: 'rgba(0, 78, 82, 0.8)',
  rippleRingWidth: 4,
} as const;

export const ZOOM_DEFAULTS = {
  enabled: true,
  maxZoom: 1.8,
  holdMs: 1200,
  easeMs: 480,
} as const;

export const ZOOM_LIMITS = { min: 1.2, max: 3 } as const;
export const EASE_LIMITS = { minMs: 150, maxMs: 700 } as const;

/** Maps the smoothness control (0 to 1) to the ease time of the zoom, in milliseconds. */
export function smoothnessToEaseMs(smoothness: number): number {
  const s = Math.min(1, Math.max(0, smoothness));
  return EASE_LIMITS.minMs + (EASE_LIMITS.maxMs - EASE_LIMITS.minMs) * s;
}

export type BubbleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BubbleSize = 'S' | 'M' | 'L';
export type BubbleShape = 'circle' | 'rounded-square';

export const BUBBLE_DEFAULTS = {
  visible: true,
  corner: 'bottom-right' as BubbleCorner,
  size: 'M' as BubbleSize,
  shape: 'circle' as BubbleShape,
  /** Side of the bubble as a share of the shorter side of the content area. */
  sizeShare: { S: 0.16, M: 0.22, L: 0.3 } as Record<BubbleSize, number>,
  /** Gap to the content edge, as a share of the bubble side. */
  marginShare: 0.18,
  /** Corner radius of the rounded square, as a share of its side. */
  roundedShare: 0.22,
} as const;

export const LAYOUT_DEFAULTS = {
  /** Padding around the recording as a share of the shorter output side. */
  paddingShare: 0.06,
  maxPaddingShare: 0.25,
  /** Corner radius of the recording as a share of the shorter content side. */
  radiusShare: 0.025,
  shadow: { offsetYShare: 0.012, blurShare: 0.04, alpha: 0.35 },
} as const;

export type BackgroundFill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angleDeg: number }
  | { kind: 'pattern'; pattern: 'dots' | 'grid'; color: string; base: string };

export interface BackgroundPreset {
  id: string;
  label: string;
  fill: BackgroundFill;
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  { id: 'butter', label: 'Butter', fill: { kind: 'solid', color: '#FBF8F4' } },
  { id: 'green', label: 'Green', fill: { kind: 'solid', color: '#004E52' } },
  {
    id: 'deep-green',
    label: 'Deep green',
    fill: { kind: 'gradient', from: '#004E52', to: '#00292B', angleDeg: 135 },
  },
  {
    id: 'dots',
    label: 'Dots',
    fill: { kind: 'pattern', pattern: 'dots', color: '#004E52', base: '#FBF8F4' },
  },
  {
    id: 'grid',
    label: 'Grid',
    fill: { kind: 'pattern', pattern: 'grid', color: '#FBF8F4', base: '#004E52' },
  },
];

export const DEFAULT_BACKGROUND_ID = 'deep-green';
export const DEFAULT_FPS = 30;
