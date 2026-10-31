import { TEXT_FONT, TEXT_GLYPHS } from './text-font-data';

/**
 * Draws text into a coverage mask with plain loops, so it works in an export worker that has no
 * DOM and no canvas. The letters are the Urbanist Bold outlines in `text-font-data.ts`.
 */

interface Point {
  x: number;
  y: number;
  on: boolean;
}

const FALLBACK = 63; // the question mark

const outlines = new Map<number, Point[][]>();

function glyphCode(code: number): number {
  return TEXT_GLYPHS[code] === undefined ? FALLBACK : code;
}

function outlineOf(code: number): Point[][] {
  const cached = outlines.get(code);
  if (cached !== undefined) return cached;
  const path = TEXT_GLYPHS[code]?.path ?? '';
  const contours: Point[][] =
    path === ''
      ? []
      : path.split('|').map((contour) =>
          contour.split(' ').map((point) => {
            const [x, y, on] = point.split(',');
            return { x: Number(x), y: Number(y), on: on === '1' };
          }),
        );
  outlines.set(code, contours);
  return contours;
}

/** Width of `text` in pixels at `fontPx`. No kerning, which the preview switches off as well. */
export function textWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const char of text) {
    units += TEXT_GLYPHS[glyphCode(char.codePointAt(0) ?? FALLBACK)]?.advance ?? 0;
  }
  return (units * fontPx) / TEXT_FONT.unitsPerEm;
}

export interface TextMask {
  width: number;
  height: number;
  /** Coverage 0 to 255, row by row. */
  alpha: Uint8Array;
  /** Where the left end of the text and its baseline are inside the mask. */
  originX: number;
  baselineY: number;
}

type Add = (x0: number, y0: number, x1: number, y1: number) => void;

/** Calls `line` for each straight piece of the contour, with curves cut into short pieces. */
function flatten(
  contour: readonly Point[],
  toX: (x: number) => number,
  toY: (y: number) => number,
  line: Add,
): void {
  const count = contour.length;
  if (count < 2) return;
  const at = (i: number): Point =>
    contour[((i % count) + count) % count] ?? { x: 0, y: 0, on: true };
  const startIndex = contour.findIndex((p) => p.on);
  let start: { x: number; y: number };
  let first: number;
  if (startIndex >= 0) {
    start = at(startIndex);
    first = startIndex + 1;
  } else {
    // Every point is off the curve: start halfway between the last and the first.
    const a = at(0);
    const b = at(count - 1);
    start = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    first = 0;
  }
  let px = toX(start.x);
  let py = toY(start.y);
  const sx = px;
  const sy = py;
  const lineTo = (x: number, y: number): void => {
    line(px, py, x, y);
    px = x;
    py = y;
  };
  const quadTo = (cx: number, cy: number, x: number, y: number): void => {
    const steps = Math.max(4, Math.min(16, Math.ceil(Math.hypot(x - px, y - py) / 3)));
    const x0 = px;
    const y0 = py;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const u = 1 - t;
      lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
  };
  const total = startIndex >= 0 ? count - 1 : count;
  let i = 0;
  while (i < total) {
    const point = at(first + i);
    if (point.on) {
      lineTo(toX(point.x), toY(point.y));
      i += 1;
      continue;
    }
    const next = at(first + i + 1);
    const hasNext = i + 1 < total;
    if (hasNext && !next.on) {
      quadTo(toX(point.x), toY(point.y), toX((point.x + next.x) / 2), toY((point.y + next.y) / 2));
      i += 1;
    } else if (hasNext) {
      quadTo(toX(point.x), toY(point.y), toX(next.x), toY(next.y));
      i += 2;
    } else {
      quadTo(toX(point.x), toY(point.y), sx, sy);
      i += 1;
    }
  }
  lineTo(sx, sy);
}

/** Signed area accumulation: each edge adds its coverage, and a running sum turns it into pixels. */
function addEdge(
  area: Float32Array,
  stride: number,
  height: number,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  if (b === d) return;
  let x0 = a;
  let y0 = b;
  let x1 = c;
  let y1 = d;
  let dir = 1;
  if (y0 > y1) {
    [x0, y0, x1, y1] = [x1, y1, x0, y0];
    dir = -1;
  }
  const slope = (x1 - x0) / (y1 - y0);
  let x = x0;
  if (y0 < 0) x -= y0 * slope;
  const first = Math.max(0, Math.floor(y0));
  const last = Math.min(height, Math.ceil(y1));
  for (let y = first; y < last; y += 1) {
    const row = y * stride;
    const dy = Math.min(y + 1, y1) - Math.max(y, y0);
    const next = x + slope * dy;
    const d2 = dy * dir;
    const lo = x < next ? x : next;
    const hi = x < next ? next : x;
    const loFloor = Math.floor(lo);
    const loI = loFloor;
    const hiCeil = Math.ceil(hi);
    if (hiCeil <= loI + 1) {
      const mid = 0.5 * (x + next) - loFloor;
      area[row + loI] = (area[row + loI] ?? 0) + d2 - d2 * mid;
      area[row + loI + 1] = (area[row + loI + 1] ?? 0) + d2 * mid;
    } else {
      const s = 1 / (hi - lo);
      const loFrac = lo - loFloor;
      const a0 = 0.5 * s * (1 - loFrac) * (1 - loFrac);
      const hiFrac = hi - hiCeil + 1;
      const am = 0.5 * s * hiFrac * hiFrac;
      area[row + loI] = (area[row + loI] ?? 0) + d2 * a0;
      if (hiCeil === loI + 2) {
        area[row + loI + 1] = (area[row + loI + 1] ?? 0) + d2 * (1 - a0 - am);
      } else {
        const a1 = s * (1.5 - loFrac);
        area[row + loI + 1] = (area[row + loI + 1] ?? 0) + d2 * (a1 - a0);
        for (let xi = loI + 2; xi < hiCeil - 1; xi += 1) {
          area[row + xi] = (area[row + xi] ?? 0) + d2 * s;
        }
        const a2 = a1 + (hiCeil - loI - 3) * s;
        area[row + hiCeil - 1] = (area[row + hiCeil - 1] ?? 0) + d2 * (1 - a2 - am);
      }
      area[row + hiCeil] = (area[row + hiCeil] ?? 0) + d2 * am;
    }
    x = next;
  }
}

/** Draws one line of text at `fontPx` into a mask, with the baseline on a whole pixel row. */
export function rasterizeText(text: string, fontPx: number): TextMask {
  const scale = fontPx / TEXT_FONT.unitsPerEm;
  const pad = 2;
  const above = Math.ceil(TEXT_FONT.ascent * scale) + pad;
  const below = Math.ceil(-TEXT_FONT.descent * scale) + pad;
  const width = Math.ceil(textWidth(text, fontPx)) + pad * 2;
  const height = above + below;
  const stride = width + 4;
  const area = new Float32Array(stride * height + 8);

  let penX = pad;
  for (const char of text) {
    const code = glyphCode(char.codePointAt(0) ?? FALLBACK);
    const left = penX;
    for (const contour of outlineOf(code)) {
      flatten(
        contour,
        (x) => left + x * scale,
        (y) => above - y * scale,
        (x0, y0, x1, y1) => {
          addEdge(area, stride, height, x0, y0, x1, y1);
        },
      );
    }
    penX += ((TEXT_GLYPHS[code]?.advance ?? 0) * fontPx) / TEXT_FONT.unitsPerEm;
  }

  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) {
      sum += area[y * stride + x] ?? 0;
      alpha[y * width + x] = Math.round(Math.min(1, Math.abs(sum)) * 255);
    }
  }
  return { width, height, alpha, originX: pad, baselineY: above };
}
