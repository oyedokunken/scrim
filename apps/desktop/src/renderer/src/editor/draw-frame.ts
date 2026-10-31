import { CURSOR_DEFAULTS, unit } from '@scrim/core/render';
import type { BackgroundFill, FrameDescription, RenderModel } from '@scrim/core/render';
import type { CssCursorPaint } from '../../../shared/render-style';

/** The pictures a frame is made from. Sizes come from the elements, in their own pixels. */
export interface FrameMedia {
  screen: CanvasImageSource & { videoWidth: number; videoHeight: number };
  camera: (CanvasImageSource & { videoWidth: number; videoHeight: number }) | null;
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  fill: BackgroundFill,
  w: number,
  h: number,
): void {
  if (fill.kind === 'solid') {
    ctx.fillStyle = fill.color;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (fill.kind === 'gradient') {
    const angle = (fill.angleDeg * Math.PI) / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const gradient = ctx.createLinearGradient(
      w / 2 - dx * half,
      h / 2 - dy * half,
      w / 2 + dx * half,
      h / 2 + dy * half,
    );
    gradient.addColorStop(0, fill.from);
    gradient.addColorStop(1, fill.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = fill.base;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fill.color;
  ctx.strokeStyle = fill.color;
  const step = Math.max(16, Math.min(w, h) / 36);
  if (fill.pattern === 'dots') {
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, step * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
}

/**
 * Draws one output frame of the model onto a canvas whose context is already scaled so that one
 * unit is one output pixel: background, shadow, the recording seen through the camera, halo and
 * ripples, then the camera bubble. It reads the same description the export reads.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  model: RenderModel,
  frame: FrameDescription,
  media: FrameMedia,
  paint: CssCursorPaint,
  plain = false,
): void {
  const { layout } = model;
  const { output, content } = layout;
  ctx.clearRect(0, 0, output.width, output.height);
  if (layout.background.kind === 'fill') {
    fillBackground(ctx, layout.background.fill, output.width, output.height);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, output.width, output.height);
  }

  // The plain picture shows the whole recording: no zoom, so the view is the full frame.
  const view = plain
    ? { x: 0, y: 0, width: model.source.width, height: model.source.height }
    : frame.view;
  const sw = media.screen.videoWidth;
  const sh = media.screen.videoHeight;
  ctx.save();
  if (layout.shadow !== null) {
    ctx.shadowColor = `rgba(0, 0, 0, ${String(layout.shadow.alpha)})`;
    ctx.shadowBlur = layout.shadow.blur;
    ctx.shadowOffsetY = layout.shadow.offsetY;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(content.x, content.y, content.width, content.height, layout.radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  ctx.beginPath();
  ctx.roundRect(content.x, content.y, content.width, content.height, layout.radius);
  ctx.clip();
  if (sw > 0 && sh > 0) {
    const kx = sw / model.source.width;
    const ky = sh / model.source.height;
    ctx.drawImage(
      media.screen,
      view.x * kx,
      view.y * ky,
      view.width * kx,
      view.height * ky,
      content.x,
      content.y,
      content.width,
      content.height,
    );
  }

  const zoomK = content.width / view.width;
  const toX = (x: number): number => content.x + (x - view.x) * zoomK;
  const toY = (y: number): number => content.y + (y - view.y) * zoomK;
  const u = unit(model.source) * zoomK;
  if (plain) {
    if (frame.pointer !== null)
      drawPointer(ctx, toX(frame.pointer.x), toY(frame.pointer.y), u * 20);
    ctx.restore();
    drawBubble(ctx, frame, media);
    return;
  }
  for (const ripple of frame.cursor.ripples) {
    ctx.beginPath();
    ctx.arc(toX(ripple.x), toY(ripple.y), Math.max(0, ripple.radius * zoomK - 1), 0, Math.PI * 2);
    ctx.lineWidth = CURSOR_DEFAULTS.rippleRingWidth * u;
    ctx.strokeStyle = `rgba(${paint.rippleRgb}, ${String(paint.rippleAlpha * ripple.alpha)})`;
    ctx.stroke();
  }
  const halo = frame.cursor.halo;
  if (halo !== null) {
    const radius = halo.radius * zoomK;
    ctx.beginPath();
    ctx.arc(toX(halo.x), toY(halo.y), radius, 0, Math.PI * 2);
    ctx.fillStyle = paint.haloFill;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      toX(halo.x),
      toY(halo.y),
      Math.max(0, radius - (CURSOR_DEFAULTS.haloRingWidth * u) / 2),
      0,
      Math.PI * 2,
    );
    ctx.lineWidth = CURSOR_DEFAULTS.haloRingWidth * u;
    ctx.strokeStyle = paint.haloRing;
    ctx.stroke();
  }
  ctx.restore();
  drawBubble(ctx, frame, media);
}

/** A plain arrow pointer with its tip at (x, y), `size` tall. */
function drawPointer(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.5, 13);
  ctx.lineTo(7.5, 19.5);
  ctx.lineTo(10, 18.4);
  ctx.lineTo(7, 12);
  ctx.lineTo(13, 12);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  frame: FrameDescription,
  media: FrameMedia,
): void {
  const bubble = frame.bubble;
  const camera = media.camera;
  if (bubble !== null && camera !== null && frame.cameraTimeMs !== null) {
    const { rect } = bubble;
    const cw = camera.videoWidth;
    const ch = camera.videoHeight;
    if (cw > 0 && ch > 0) {
      const side = Math.min(cw, ch);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, bubble.radius);
      ctx.clip();
      ctx.drawImage(
        camera,
        (cw - side) / 2,
        (ch - side) / 2,
        side,
        side,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, bubble.radius);
      ctx.lineWidth = Math.max(2, rect.width * 0.015);
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
  }
}

/** Which picture the stage shows. Compare shows both, split at a point. */
export type CompareMode = 'before' | 'compare' | 'after';

export const SPLIT_MIN = 0.05;
export const SPLIT_MAX = 0.95;

/** Where the divider goes for a pointer at `clientX` over a stage that starts at `left`. */
export function splitFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0.5;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, (clientX - left) / width));
}

/**
 * Paints the stage for the chosen mode at one moment. Before is the plain picture: the
 * background, the whole recording with no zoom, the cursor and the camera bubble, and nothing
 * else. After is the finished frame with every effect. Compare is the finished frame with the
 * plain picture over its left side up to `split`. Both come from the same description and the same
 * video clock, so they never drift apart.
 */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  mode: CompareMode,
  split: number,
  model: RenderModel,
  frame: FrameDescription,
  media: FrameMedia,
  paint: CssCursorPaint,
): void {
  const { output } = model.layout;
  if (mode === 'before') {
    drawFrame(ctx, model, frame, media, paint, true);
    return;
  }
  drawFrame(ctx, model, frame, media, paint);
  if (mode === 'after') return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, output.width * split, output.height);
  ctx.clip();
  drawFrame(ctx, model, frame, media, paint, true);
  ctx.restore();
}
