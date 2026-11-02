import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND_ID } from '@scrim/core/render';
import { PADDING_SHARE, RADIUS_SHARE } from '../../../shared/render-style';
import { drawCover, fillBackground } from '../editor/draw-frame';
import { NO_BACKGROUND, type BackgroundValue } from '../panels/background-panel';
import type { Size } from './geometry';

/** The background around a screenshot, as the Background panel holds it. */
export type ShotBackground = BackgroundValue;

/** Nothing around the picture, which is how every screenshot starts. */
export const NO_SHOT_BACKGROUND: ShotBackground = {
  id: NO_BACKGROUND,
  padding: 'medium',
  corners: 'soft',
  shadow: true,
};

export function hasBackground(background: ShotBackground): boolean {
  return background.id !== NO_BACKGROUND;
}

export interface FrameGeometry {
  /** The size of the finished picture, background included. */
  width: number;
  height: number;
  /** Space between the edge and the screenshot, in pixels of the finished picture. */
  pad: number;
  /** Corner radius of the screenshot, in the same pixels. */
  radius: number;
  shadow: { blur: number; offsetY: number; alpha: number } | null;
}

/**
 * Where the screenshot sits on its background. The padding and the corners are shares of the shorter
 * side, as they are for a recording, so a screenshot and a video get the same look from the same
 * choice. The picture grows by the padding and is never scaled down.
 */
export function frameGeometry(content: Size, background: ShotBackground): FrameGeometry {
  if (!hasBackground(background)) {
    return { width: content.width, height: content.height, pad: 0, radius: 0, shadow: null };
  }
  const short = Math.min(content.width, content.height);
  const pad = Math.round(PADDING_SHARE[background.padding] * short);
  const radius = Math.round(RADIUS_SHARE[background.corners] * short);
  return {
    width: content.width + pad * 2,
    height: content.height + pad * 2,
    pad,
    radius,
    shadow:
      background.shadow && pad > 0
        ? { blur: Math.max(8, Math.round(pad * 0.7)), offsetY: Math.round(pad * 0.3), alpha: 0.35 }
        : null,
  };
}

/**
 * Draws the screenshot, already rendered onto `content`, on its background in a new canvas. The
 * picture the person chose is covered to fit. A picture that is not loaded yet or was removed
 * falls back to the default preset, so the result is never a blank frame.
 */
export function composeOnBackground(
  content: HTMLCanvasElement,
  background: ShotBackground,
  image: HTMLImageElement | null,
): HTMLCanvasElement {
  const geometry = frameGeometry({ width: content.width, height: content.height }, background);
  if (!hasBackground(background)) return content;
  const out = document.createElement('canvas');
  out.width = geometry.width;
  out.height = geometry.height;
  const ctx = out.getContext('2d');
  if (!ctx) return content;
  if (image !== null && background.id.startsWith('image:')) {
    drawCover(ctx, image, 0, 0, out.width, out.height);
  } else {
    const preset =
      BACKGROUND_PRESETS.find((candidate) => candidate.id === background.id) ??
      BACKGROUND_PRESETS.find((candidate) => candidate.id === DEFAULT_BACKGROUND_ID);
    if (preset !== undefined) fillBackground(ctx, preset.fill, out.width, out.height);
  }
  ctx.save();
  if (geometry.shadow !== null) {
    ctx.shadowColor = `rgba(0, 0, 0, ${String(geometry.shadow.alpha)})`;
    ctx.shadowBlur = geometry.shadow.blur;
    ctx.shadowOffsetY = geometry.shadow.offsetY;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(geometry.pad, geometry.pad, content.width, content.height, geometry.radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  ctx.beginPath();
  ctx.roundRect(geometry.pad, geometry.pad, content.width, content.height, geometry.radius);
  ctx.clip();
  ctx.drawImage(content, geometry.pad, geometry.pad);
  ctx.restore();
  return out;
}
