// Turns the Urbanist Bold WOFF file into glyph outlines for the export text drawing.
//
// The export draws on plain byte arrays in a worker with no DOM, so it cannot use canvas fonts.
// Outlines for the Latin letters are stored as a TypeScript module and drawn by `text-raster.ts`.
//
// Run: node scripts/build-text-font.mts <path to urbanist-latin-700-normal.woff>
// The file ships in the @fontsource/urbanist package (SIL Open Font License).
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const input = process.argv[2];
if (input === undefined) throw new Error('Pass the path to urbanist-latin-700-normal.woff.');
const woff = readFileSync(input);
const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
if (view.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF file.');

const tables = new Map<string, Buffer>();
const tableCount = view.getUint16(12);
for (let i = 0; i < tableCount; i += 1) {
  const base = 44 + i * 20;
  const tag = woff.subarray(base, base + 4).toString('latin1');
  const offset = view.getUint32(base + 4);
  const compressed = view.getUint32(base + 8);
  const original = view.getUint32(base + 12);
  const raw = woff.subarray(offset, offset + compressed);
  tables.set(tag, compressed < original ? inflateSync(raw) : Buffer.from(raw));
}
const need = (tag: string): DataView => {
  const table = tables.get(tag);
  if (table === undefined) throw new Error(`Missing table ${tag}.`);
  return new DataView(table.buffer, table.byteOffset, table.byteLength);
};

const head = need('head');
const unitsPerEm = head.getUint16(18);
const longLoca = head.getInt16(50) === 1;
const hhea = need('hhea');
const ascent = hhea.getInt16(4);
const descent = hhea.getInt16(6);
const metricCount = hhea.getUint16(34);
const hmtx = need('hmtx');
const loca = need('loca');
const glyf = need('glyf');

const locaAt = (index: number): number =>
  longLoca ? loca.getUint32(index * 4) : loca.getUint16(index * 2) * 2;
const advanceOf = (glyph: number): number => hmtx.getUint16(Math.min(glyph, metricCount - 1) * 4);

// cmap format 4, platform 3 (Windows) encoding 1 (Unicode BMP).
const cmap = need('cmap');
let cmapOffset = -1;
for (let i = 0; i < cmap.getUint16(2); i += 1) {
  const platform = cmap.getUint16(4 + i * 8);
  const encoding = cmap.getUint16(6 + i * 8);
  if (platform === 3 && encoding === 1) cmapOffset = cmap.getUint32(8 + i * 8);
}
if (cmapOffset < 0 || cmap.getUint16(cmapOffset) !== 4) throw new Error('No format 4 cmap.');
const segCount = cmap.getUint16(cmapOffset + 6) / 2;
const endBase = cmapOffset + 14;
const startBase = endBase + segCount * 2 + 2;
const deltaBase = startBase + segCount * 2;
const rangeBase = deltaBase + segCount * 2;
function glyphFor(code: number): number {
  for (let i = 0; i < segCount; i += 1) {
    if (code > cmap.getUint16(endBase + i * 2)) continue;
    if (code < cmap.getUint16(startBase + i * 2)) return 0;
    const range = cmap.getUint16(rangeBase + i * 2);
    const delta = cmap.getInt16(deltaBase + i * 2);
    if (range === 0) return (code + delta) & 0xffff;
    const at = rangeBase + i * 2 + range + (code - cmap.getUint16(startBase + i * 2)) * 2;
    const glyph = cmap.getUint16(at);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  }
  return 0;
}

interface Point {
  x: number;
  y: number;
  on: boolean;
}
type Contour = Point[];

function readGlyph(index: number, depth = 0): Contour[] {
  const start = locaAt(index);
  const end = locaAt(index + 1);
  if (end <= start || depth > 4) return [];
  const contours = glyf.getInt16(start);
  let at = start + 10;
  if (contours < 0) {
    const out: Contour[] = [];
    let more = true;
    while (more) {
      const flags = glyf.getUint16(at);
      const component = glyf.getUint16(at + 2);
      at += 4;
      let dx: number;
      let dy: number;
      if (flags & 1) {
        dx = glyf.getInt16(at);
        dy = glyf.getInt16(at + 2);
        at += 4;
      } else {
        dx = glyf.getInt8(at);
        dy = glyf.getInt8(at + 1);
        at += 2;
      }
      let a = 1;
      let d = 1;
      if (flags & 8) {
        a = d = glyf.getInt16(at) / 16384;
        at += 2;
      } else if (flags & 0x40) {
        a = glyf.getInt16(at) / 16384;
        d = glyf.getInt16(at + 2) / 16384;
        at += 4;
      } else if (flags & 0x80) {
        throw new Error('Rotated components are not supported.');
      }
      for (const contour of readGlyph(component, depth + 1)) {
        out.push(contour.map((p) => ({ x: p.x * a + dx, y: p.y * d + dy, on: p.on })));
      }
      more = (flags & 0x20) !== 0;
    }
    return out;
  }
  const ends: number[] = [];
  for (let i = 0; i < contours; i += 1) ends.push(glyf.getUint16(at + i * 2));
  at += contours * 2;
  at += 2 + glyf.getUint16(at);
  const count = (ends[ends.length - 1] ?? -1) + 1;
  const flags: number[] = [];
  while (flags.length < count) {
    const flag = glyf.getUint8(at);
    at += 1;
    flags.push(flag);
    if (flag & 8) {
      let repeat = glyf.getUint8(at);
      at += 1;
      while (repeat > 0) {
        flags.push(flag);
        repeat -= 1;
      }
    }
  }
  const coordinates = (short: number, same: number): number[] => {
    const values: number[] = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) {
        const step = glyf.getUint8(at);
        at += 1;
        value += flag & same ? step : -step;
      } else if (!(flag & same)) {
        value += glyf.getInt16(at);
        at += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = coordinates(2, 16);
  const ys = coordinates(4, 32);
  const out: Contour[] = [];
  let first = 0;
  for (const last of ends) {
    const contour: Contour = [];
    for (let i = first; i <= last; i += 1) {
      contour.push({ x: xs[i] ?? 0, y: ys[i] ?? 0, on: ((flags[i] ?? 0) & 1) === 1 });
    }
    out.push(contour);
    first = last + 1;
  }
  return out;
}

// Printable ASCII and Latin-1. Anything else is drawn as a question mark.
const codes: number[] = [];
for (let c = 32; c <= 126; c += 1) codes.push(c);
for (let c = 161; c <= 255; c += 1) codes.push(c);

const entries: string[] = [];
for (const code of codes) {
  const glyph = glyphFor(code);
  if (glyph === 0 && code !== 32) continue;
  const path = readGlyph(glyph)
    .map((contour) => contour.map((p) => `${String(p.x)},${String(p.y)},${p.on ? 1 : 0}`).join(' '))
    .join('|');
  entries.push(`  ${String(code)}: { advance: ${String(advanceOf(glyph))}, path: '${path}' },`);
}

const text = `// Generated by scripts/build-text-font.mts from Urbanist Bold (SIL Open Font License). Do not edit.
// Outlines are TrueType points in font units: "x,y,on" separated by spaces, contours by "|".

export const TEXT_FONT = {
  unitsPerEm: ${String(unitsPerEm)},
  ascent: ${String(ascent)},
  descent: ${String(descent)},
} as const;

export const TEXT_GLYPHS: Readonly<Record<number, { advance: number; path: string }>> = {
${entries.join('\n')}
};
`;
writeFileSync(new URL('../src/main/export/text-font-data.ts', import.meta.url), text);
console.log(`Wrote ${String(entries.length)} glyphs.`);
