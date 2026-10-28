import type { BackgroundFill, Layout } from '@scrim/core/render';
import type { Frame } from '@scrim/core';

/** A picture of 4 bytes per pixel in blue, green, red, unused order, row by row. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgb = readonly [number, number, number];

export function parseHex(color: string): Rgb {
  const value = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (value === undefined) return [0, 0, 0];
  const n = Number.parseInt(value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Signed distance from a point to a rounded rectangle, negative inside. */
export function roundedRectDistance(
  px: number,
  py: number,
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
): number {
  const hx = rect.width / 2;
  const hy = rect.height / 2;
  const r = Math.min(radius, hx, hy);
  const qx = Math.abs(px - (rect.x + hx)) - (hx - r);
  const qy = Math.abs(py - (rect.y + hy)) - (hy - r);
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r;
}

function fillSolid(data: Uint8Array, color: Rgb): void {
  const [r, g, b] = color;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = b;
    data[i + 1] = g;
    data[i + 2] = r;
    data[i + 3] = 255;
  }
}

function fillGradient(
  data: Uint8Array,
  size: Frame,
  fill: Extract<BackgroundFill, { kind: 'gradient' }>,
): void {
  const from = parseHex(fill.from);
  const to = parseHex(fill.to);
  // CSS convention: 0 degrees points up and 90 points right.
  const angle = (fill.angleDeg * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const length = Math.abs(size.width * dx) + Math.abs(size.height * dy);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const t = clamp01(
        ((x + 0.5 - size.width / 2) * dx + (y + 0.5 - size.height / 2) * dy) / length + 0.5,
      );
      const i = (y * size.width + x) * 4;
      data[i] = Math.round(from[2] + (to[2] - from[2]) * t);
      data[i + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      data[i + 2] = Math.round(from[0] + (to[0] - from[0]) * t);
      data[i + 3] = 255;
    }
  }
}

function fillPattern(
  data: Uint8Array,
  size: Frame,
  fill: Extract<BackgroundFill, { kind: 'pattern' }>,
): void {
  const base = parseHex(fill.base);
  const ink = parseHex(fill.color);
  fillSolid(data, base);
  const short = Math.min(size.width, size.height);
  const step = Math.max(12, Math.round(short / 30));
  const mixIn = (i: number, amount: number): void => {
    if (amount <= 0) return;
    data[i] = Math.round((data[i] ?? 0) + (ink[2] - (data[i] ?? 0)) * amount);
    data[i + 1] = Math.round((data[i + 1] ?? 0) + (ink[1] - (data[i + 1] ?? 0)) * amount);
    data[i + 2] = Math.round((data[i + 2] ?? 0) + (ink[0] - (data[i + 2] ?? 0)) * amount);
  };
  if (fill.pattern === 'dots') {
    const radius = Math.max(1.4, step * 0.09);
    for (let y = 0; y < size.height; y += 1) {
      const cy = (Math.floor(y / step) + 0.5) * step;
      for (let x = 0; x < size.width; x += 1) {
        const cx = (Math.floor(x / step) + 0.5) * step;
        const cover = clamp01(radius - Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) + 0.5);
        mixIn((y * size.width + x) * 4, cover * 0.55);
      }
    }
    return;
  }
  const line = Math.max(1, Math.round(step / 24));
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const on = x % step < line || y % step < line;
      if (on) mixIn((y * size.width + x) * 4, 0.28);
    }
  }
}

function blurBox(values: Float32Array, width: number, height: number, radius: number): void {
  if (radius < 1) return;
  const scratch = new Float32Array(Math.max(width, height));
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1)
      sum += values[row + Math.min(width - 1, Math.max(0, x))] ?? 0;
    for (let x = 0; x < width; x += 1) {
      scratch[x] = sum / span;
      sum +=
        (values[row + Math.min(width - 1, x + radius + 1)] ?? 0) -
        (values[row + Math.max(0, x - radius)] ?? 0);
    }
    for (let x = 0; x < width; x += 1) values[row + x] = scratch[x] ?? 0;
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1)
      sum += values[Math.min(height - 1, Math.max(0, y)) * width + x] ?? 0;
    for (let y = 0; y < height; y += 1) {
      scratch[y] = sum / span;
      sum +=
        (values[Math.min(height - 1, y + radius + 1) * width + x] ?? 0) -
        (values[Math.max(0, y - radius) * width + x] ?? 0);
    }
    for (let y = 0; y < height; y += 1) values[y * width + x] = scratch[y] ?? 0;
  }
}

function applyShadow(data: Uint8Array, layout: Layout): void {
  const shadow = layout.shadow;
  if (shadow === null) return;
  const { width, height } = layout.output;
  const rect = { ...layout.content, y: layout.content.y + shadow.offsetY };
  const mask = new Float32Array(width * height);
  const pad = Math.ceil(shadow.blur * 1.5) + 2;
  const x0 = Math.max(0, Math.floor(rect.x - pad));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width + pad));
  const y0 = Math.max(0, Math.floor(rect.y - pad));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height + pad));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      mask[y * width + x] = clamp01(
        0.5 - roundedRectDistance(x + 0.5, y + 0.5, rect, layout.radius),
      );
    }
  }
  const radius = Math.max(1, Math.round(shadow.blur / 2));
  for (let pass = 0; pass < 3; pass += 1) blurBox(mask, width, height, radius);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const amount = 1 - (mask[y * width + x] ?? 0) * shadow.alpha;
      const i = (y * width + x) * 4;
      data[i] = Math.round((data[i] ?? 0) * amount);
      data[i + 1] = Math.round((data[i + 1] ?? 0) * amount);
      data[i + 2] = Math.round((data[i + 2] ?? 0) * amount);
    }
  }
}

/**
 * The part of every frame that never changes: the background and the soft shadow under the
 * recording. Built once per export. `image` is a picture already fitted to the output size.
 */
export function buildBase(layout: Layout, image?: Raster): Uint8Array {
  const { width, height } = layout.output;
  const data = new Uint8Array(width * height * 4);
  const background = layout.background;
  if (
    background.kind === 'image' &&
    image !== undefined &&
    image.width === width &&
    image.height === height
  ) {
    data.set(image.data);
  } else if (background.kind === 'fill') {
    const fill = background.fill;
    if (fill.kind === 'solid') fillSolid(data, parseHex(fill.color));
    else if (fill.kind === 'gradient') fillGradient(data, layout.output, fill);
    else fillPattern(data, layout.output, fill);
  } else {
    fillSolid(data, background.kind === 'image' ? parseHex('#004E52') : [0, 0, 0]);
  }
  if (background.kind !== 'none') applyShadow(data, layout);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}
