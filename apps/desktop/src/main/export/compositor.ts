import { CURSOR_DEFAULTS, unit } from '@scrim/core/render';
import type { CursorState, Layout } from '@scrim/core/render';
import type { Frame, ViewRect } from '@scrim/core';
import { roundedRectDistance } from './raster';

/** One colour with an opacity, in red, green, blue, alpha (alpha 0 to 1). */
export type Rgba = readonly [number, number, number, number];

export interface CursorPaint {
  haloFill: Rgba;
  haloRing: Rgba;
  rippleRing: Rgba;
}

export interface BubblePlacement {
  /** Top left and side in output pixels. */
  x: number;
  y: number;
  side: number;
  /** Corner radius in output pixels. Half the side for a circle. */
  radius: number;
}

export interface FrameInput {
  /** The recorded area, `source.width * source.height * 4` bytes. */
  screen: Uint8Array;
  /** The camera picture cropped to a square, `cameraSize ** 2 * 4` bytes, or null. */
  camera: Uint8Array | null;
  cameraSize: number;
  view: ViewRect;
  cursor: CursorState;
  bubble: BubblePlacement | null;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** The same bytes as 32 bit words, one per pixel. Copies only when the bytes are not aligned. */
function words(bytes: Uint8Array): Uint32Array {
  if (bytes.byteOffset % 4 === 0) {
    return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  }
  throw new Error('Picture memory is not aligned to a whole pixel.');
}

/**
 * Draws one finished frame. All the heavy work is plain loops over byte arrays, so it runs the
 * same in a worker or a test. `base` is the background and shadow from `buildBase`.
 */
export class Compositor {
  private readonly rx0: number;
  private readonly ry0: number;
  private readonly rx1: number;
  private readonly ry1: number;
  private readonly cornerRadius: number;
  private readonly corner: Uint8Array;
  private readonly xi0: Int32Array;
  private readonly xi1: Int32Array;
  private readonly xw: Uint16Array;
  private readonly unitScale: number;

  constructor(
    private readonly layout: Layout,
    private readonly source: Frame,
    private readonly base: Uint8Array,
    private readonly paint: CursorPaint,
  ) {
    const { content } = layout;
    this.rx0 = Math.round(content.x);
    this.ry0 = Math.round(content.y);
    this.rx1 = Math.max(this.rx0 + 1, Math.round(content.x + content.width));
    this.ry1 = Math.max(this.ry0 + 1, Math.round(content.y + content.height));
    const width = this.rx1 - this.rx0;
    const height = this.ry1 - this.ry0;
    this.cornerRadius = Math.min(Math.round(layout.radius), width >> 1, height >> 1);
    const r = this.cornerRadius;
    this.corner = new Uint8Array(r * r);
    for (let dy = 0; dy < r; dy += 1) {
      for (let dx = 0; dx < r; dx += 1) {
        const distance = Math.sqrt((r - dx - 0.5) ** 2 + (r - dy - 0.5) ** 2);
        this.corner[dy * r + dx] = Math.round(clamp01(r - distance + 0.5) * 255);
      }
    }
    this.xi0 = new Int32Array(width);
    this.xi1 = new Int32Array(width);
    this.xw = new Uint16Array(width);
    this.unitScale = unit(source);
  }

  render(input: FrameInput, out: Uint8Array): void {
    out.set(this.base);
    this.drawContent(input, out);
    this.drawCursor(input, out);
    this.drawBubble(input, out);
  }

  private drawContent(input: FrameInput, out: Uint8Array): void {
    const { rx0, ry0, rx1, ry1, source, layout } = this;
    const { width: ow } = layout.output;
    const { screen, view } = input;
    const contentW = rx1 - rx0;
    const contentH = ry1 - ry0;
    const stepX = view.width / contentW;
    const stepY = view.height / contentH;
    const sw = source.width;
    const sh = source.height;

    // Whole pixel copy when nothing is scaled or shifted by a fraction.
    const copy =
      Math.abs(stepX - 1) < 1e-9 &&
      Math.abs(stepY - 1) < 1e-9 &&
      Number.isInteger(view.x) &&
      Number.isInteger(view.y) &&
      this.cornerRadius === 0 &&
      view.x >= 0 &&
      view.y >= 0 &&
      view.x + contentW <= sw &&
      view.y + contentH <= sh;
    if (copy) {
      for (let y = 0; y < contentH; y += 1) {
        const from = ((view.y + y) * sw + view.x) * 4;
        out.set(screen.subarray(from, from + contentW * 4), ((ry0 + y) * ow + rx0) * 4);
      }
      return;
    }

    const src = words(screen);
    const dst = words(out);
    const { xi0, xi1, xw } = this;
    for (let i = 0; i < contentW; i += 1) {
      const sx = Math.min(Math.max(view.x + (i + 0.5) * stepX - 0.5, 0), sw - 1);
      const x0 = Math.floor(sx);
      xi0[i] = x0;
      xi1[i] = Math.min(sw - 1, x0 + 1);
      xw[i] = Math.round((sx - x0) * 255);
    }

    const r = this.cornerRadius;
    for (let j = 0; j < contentH; j += 1) {
      const sy = Math.min(Math.max(view.y + (j + 0.5) * stepY - 0.5, 0), sh - 1);
      const y0 = Math.floor(sy);
      const row0 = y0 * sw;
      const row1 = Math.min(sh - 1, y0 + 1) * sw;
      const yw = Math.round((sy - y0) * 255);
      const edgeRows = Math.min(j, contentH - 1 - j);
      const outRow = (ry0 + j) * ow + rx0;

      let from = 0;
      let to = contentW;
      if (edgeRows < r) {
        from = r;
        to = contentW - r;
        for (let i = 0; i < r; i += 1) {
          const cover = this.corner[edgeRows * r + i] ?? 0;
          if (cover === 0) continue;
          this.putPixel(src, dst, outRow, i, row0, row1, yw, cover);
          this.putPixel(src, dst, outRow, contentW - 1 - i, row0, row1, yw, cover);
        }
      }
      const iyw = 256 - yw;
      for (let i = from; i < to; i += 1) {
        const a = xi0[i] ?? 0;
        const b = xi1[i] ?? 0;
        const w = xw[i] ?? 0;
        const iw = 256 - w;
        const p00 = src[row0 + a] ?? 0;
        const p01 = src[row0 + b] ?? 0;
        const p10 = src[row1 + a] ?? 0;
        const p11 = src[row1 + b] ?? 0;
        // Red and blue share one 32 bit word, in two lanes, so one multiply handles both.
        const top =
          ((Math.imul(p00 & 0x00ff00ff, iw) + Math.imul(p01 & 0x00ff00ff, w)) >>> 8) & 0x00ff00ff;
        const bottom =
          ((Math.imul(p10 & 0x00ff00ff, iw) + Math.imul(p11 & 0x00ff00ff, w)) >>> 8) & 0x00ff00ff;
        const rb = ((Math.imul(top, iyw) + Math.imul(bottom, yw)) >>> 8) & 0x00ff00ff;
        const gt = (((p00 >>> 8) & 255) * iw + ((p01 >>> 8) & 255) * w) >> 8;
        const gb = (((p10 >>> 8) & 255) * iw + ((p11 >>> 8) & 255) * w) >> 8;
        const g = (gt * iyw + gb * yw) >> 8;
        dst[outRow + i] = 0xff000000 | rb | (g << 8);
      }
    }
  }

  private putPixel(
    src: Uint32Array,
    dst: Uint32Array,
    outRow: number,
    i: number,
    row0: number,
    row1: number,
    yw: number,
    coverage: number,
  ): void {
    const a = this.xi0[i] ?? 0;
    const b = this.xi1[i] ?? 0;
    const w = this.xw[i] ?? 0;
    const p00 = src[row0 + a] ?? 0;
    const p01 = src[row0 + b] ?? 0;
    const p10 = src[row1 + a] ?? 0;
    const p11 = src[row1 + b] ?? 0;
    const under = dst[outRow + i] ?? 0;
    let packed = 0xff000000;
    for (let shift = 0; shift < 24; shift += 8) {
      const t0 = (p00 >>> shift) & 255;
      const t1 = (p10 >>> shift) & 255;
      const top = t0 + (((((p01 >>> shift) & 255) - t0) * w) >> 8);
      const bottom = t1 + (((((p11 >>> shift) & 255) - t1) * w) >> 8);
      const value = top + (((bottom - top) * yw) >> 8);
      const was = (under >>> shift) & 255;
      packed |= Math.round(was + ((value - was) * coverage) / 255) << shift;
    }
    dst[outRow + i] = packed;
  }

  /** Halo and ripples are drawn after the zoom, in output pixels, and never outside the recording. */
  private drawCursor(input: FrameInput, out: Uint8Array): void {
    const { cursor, view } = input;
    if (cursor.halo === null && cursor.ripples.length === 0) return;
    const { rx0, ry0, rx1, ry1, layout } = this;
    const kx = (rx1 - rx0) / view.width;
    const ky = (ry1 - ry0) / view.height;
    const toX = (x: number): number => rx0 + (x - view.x) * kx;
    const toY = (y: number): number => ry0 + (y - view.y) * ky;
    const clip = { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
    const ow = layout.output.width;

    for (const ripple of cursor.ripples) {
      const color = this.paint.rippleRing;
      const width = CURSOR_DEFAULTS.rippleRingWidth * this.unitScale * kx;
      drawRing(out, ow, clip, toX(ripple.x), toY(ripple.y), ripple.radius * kx, width, [
        color[0],
        color[1],
        color[2],
        color[3] * ripple.alpha,
      ]);
    }
    const halo = cursor.halo;
    if (halo !== null) {
      const cx = toX(halo.x);
      const cy = toY(halo.y);
      const radius = halo.radius * kx;
      drawDisc(out, ow, clip, cx, cy, radius, this.paint.haloFill);
      drawRing(
        out,
        ow,
        clip,
        cx,
        cy,
        radius,
        CURSOR_DEFAULTS.haloRingWidth * this.unitScale * kx,
        this.paint.haloRing,
      );
    }
  }

  private drawBubble(input: FrameInput, out: Uint8Array): void {
    const { bubble, camera, cameraSize } = input;
    if (bubble === null || camera === null || cameraSize < 2) return;
    const { width: ow, height: oh } = this.layout.output;
    const x0 = Math.max(0, Math.floor(bubble.x) - 1);
    const y0 = Math.max(0, Math.floor(bubble.y) - 1);
    const x1 = Math.min(ow, Math.ceil(bubble.x + bubble.side) + 1);
    const y1 = Math.min(oh, Math.ceil(bubble.y + bubble.side) + 1);
    const rect = { x: bubble.x, y: bubble.y, width: bubble.side, height: bubble.side };
    const border = Math.max(2, bubble.side * 0.015);
    const scale = cameraSize / bubble.side;
    for (let y = y0; y < y1; y += 1) {
      const sy = Math.min(Math.max((y + 0.5 - bubble.y) * scale - 0.5, 0), cameraSize - 1);
      const cy0 = Math.floor(sy);
      const cy1 = Math.min(cameraSize - 1, cy0 + 1);
      const fy = sy - cy0;
      for (let x = x0; x < x1; x += 1) {
        const distance = roundedRectDistance(x + 0.5, y + 0.5, rect, bubble.radius);
        const outer = clamp01(0.5 - distance);
        if (outer <= 0) continue;
        const inner = clamp01(0.5 - (distance + border));
        const sx = Math.min(Math.max((x + 0.5 - bubble.x) * scale - 0.5, 0), cameraSize - 1);
        const cx0 = Math.floor(sx);
        const cx1 = Math.min(cameraSize - 1, cx0 + 1);
        const fx = sx - cx0;
        const o = (y * ow + x) * 4;
        for (let c = 0; c < 3; c += 1) {
          const p00 = camera[(cy0 * cameraSize + cx0) * 4 + c] ?? 0;
          const p01 = camera[(cy0 * cameraSize + cx1) * 4 + c] ?? 0;
          const p10 = camera[(cy1 * cameraSize + cx0) * 4 + c] ?? 0;
          const p11 = camera[(cy1 * cameraSize + cx1) * 4 + c] ?? 0;
          const top = p00 + (p01 - p00) * fx;
          const bottom = p10 + (p11 - p10) * fx;
          const cam = top + (bottom - top) * fy;
          const face = 255 + (cam - 255) * inner;
          const under = out[o + c] ?? 0;
          out[o + c] = Math.round(under + (face - under) * outer);
        }
      }
    }
  }
}

interface Clip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function blend(out: Uint8Array, o: number, color: Rgba, coverage: number): void {
  const amount = clamp01(coverage) * color[3];
  if (amount <= 0) return;
  out[o] = Math.round((out[o] ?? 0) + (color[2] - (out[o] ?? 0)) * amount);
  out[o + 1] = Math.round((out[o + 1] ?? 0) + (color[1] - (out[o + 1] ?? 0)) * amount);
  out[o + 2] = Math.round((out[o + 2] ?? 0) + (color[0] - (out[o + 2] ?? 0)) * amount);
}

function drawDisc(
  out: Uint8Array,
  ow: number,
  clip: Clip,
  cx: number,
  cy: number,
  radius: number,
  color: Rgba,
): void {
  const x0 = Math.max(clip.x0, Math.floor(cx - radius - 1));
  const x1 = Math.min(clip.x1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(clip.y0, Math.floor(cy - radius - 1));
  const y1 = Math.min(clip.y1, Math.ceil(cy + radius + 1));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cover = radius - Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) + 0.5;
      if (cover > 0) blend(out, (y * ow + x) * 4, color, cover);
    }
  }
}

/** A ring whose outer edge is `radius`, `width` wide, drawn inwards. */
function drawRing(
  out: Uint8Array,
  ow: number,
  clip: Clip,
  cx: number,
  cy: number,
  radius: number,
  width: number,
  color: Rgba,
): void {
  const half = width / 2;
  const mid = radius - half;
  const x0 = Math.max(clip.x0, Math.floor(cx - radius - 1));
  const x1 = Math.min(clip.x1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(clip.y0, Math.floor(cy - radius - 1));
  const y1 = Math.min(clip.y1, Math.ceil(cy + radius + 1));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cover =
        half - Math.abs(Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) - mid) + 0.5;
      if (cover > 0) blend(out, (y * ow + x) * 4, color, cover);
    }
  }
}
