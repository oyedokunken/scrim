import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseMark } from '../../../packages/tokens/scripts/mark-source.mts';

// Generates every desktop icon from the brand svgs in packages/tokens/brand. Run it with
// `pnpm icons` from the repo root. CI runs it again and fails when the committed files differ.

const here = dirname(fileURLToPath(import.meta.url));
const brandDir = join(here, '../../../packages/tokens/brand');
const outDir = join(here, '../resources/icons');

const RECORD_RED = '#FF3B30';
const BUTTER = '#FBF8F4';
const BLACK = '#000000';

const mainSvg = readFileSync(join(brandDir, 'scrim-mark.svg'), 'utf8');
// Hand tuned for sizes where plain downscaling blurs the brackets. Every other size uses the
// main svg, which is already aligned to whole pixels at 32 and at multiples of 32.
const smallSvgs = new Map<number, string>(
  [16, 20, 24].map((size) => [
    size,
    readFileSync(join(brandDir, 'small', `scrim-mark-${size}.svg`), 'utf8'),
  ]),
);

const sourceFor = (size: number): string => smallSvgs.get(size) ?? mainSvg;

async function render(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The mark inside a transparent square canvas, sized like other macOS dock icons. */
async function renderPadded(size: number): Promise<Buffer> {
  const artwork = await render(mainSvg, Math.round((size * 824) / 1024));
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: artwork, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The mark with a record red dot in the lower right corner, for the tray while recording. */
function withRecordingDot(svg: string): string {
  const mark = parseMark(svg);
  const edge = mark.size;
  const dot = `<circle cx="${(edge * 0.76).toFixed(2)}" cy="${(edge * 0.76).toFixed(2)}" r="${(edge * 0.2).toFixed(2)}" fill="${RECORD_RED}" stroke="${BUTTER}" stroke-width="${Math.max(1, edge * 0.05).toFixed(2)}"/>`;
  return svg.replace('</svg>', `  ${dot}\n</svg>`);
}

/**
 * The glyph alone in black on transparent. macOS menu bar icons must be template images, which
 * the system tints for light and dark bars, so this is the one icon without the green square.
 */
function glyphOnlyTemplate(svg: string): string {
  const mark = parseMark(svg);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}">
  <path d="${mark.brackets}" fill="none" stroke="${BLACK}" stroke-width="${mark.bracketStrokeWidth}" stroke-linecap="${smallLinecap(svg)}"/>
  <circle cx="${mark.dot.cx}" cy="${mark.dot.cy}" r="${mark.dot.r}" fill="${BLACK}"/>
</svg>`;
}

function smallLinecap(svg: string): string {
  return /stroke-linecap="(\w+)"/.exec(svg)?.[1] ?? 'round';
}

/** A Windows icon with one PNG compressed image per size. */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

/** A macOS icon with one PNG compressed image per OSType. */
function buildIcns(images: { type: string; png: Buffer }[]): Buffer {
  const chunks = images.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const total = Buffer.alloc(8);
  total.write('icns', 0, 'ascii');
  total.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([total, ...chunks]);
}

function write(relative: string, data: Buffer): void {
  const file = join(outDir, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

const WINDOWS_SIZES = [16, 20, 24, 32, 40, 48, 64, 256];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const TRAY_SIZES = [16, 24, 32];
// OSType, pixel size. The 2x entries reuse a larger render, as Apple's own icons do.
const ICNS_TYPES: [string, number][] = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
];

rmSync(outDir, { recursive: true, force: true });

write(
  'icon.ico',
  buildIco(
    await Promise.all(
      WINDOWS_SIZES.map(async (size) => ({ size, png: await render(sourceFor(size), size) })),
    ),
  ),
);

const paddedBySize = new Map<number, Buffer>();
for (const size of new Set(ICNS_TYPES.map(([, pixels]) => pixels))) {
  paddedBySize.set(size, await renderPadded(size));
}
write(
  'icon.icns',
  buildIcns(
    ICNS_TYPES.map(([type, size]) => ({ type, png: paddedBySize.get(size) ?? Buffer.alloc(0) })),
  ),
);
write('icon-mac-512.png', paddedBySize.get(512) ?? Buffer.alloc(0));
write('icon.png', await render(mainSvg, 512));

for (const size of LINUX_SIZES) {
  write(`linux/${size}x${size}.png`, await render(sourceFor(size), size));
}

for (const size of TRAY_SIZES) {
  write(`tray/tray-${size}.png`, await render(sourceFor(size), size));
  write(`tray/tray-recording-${size}.png`, await render(withRecordingDot(sourceFor(size)), size));
}
write('tray/trayTemplate.png', await render(glyphOnlyTemplate(sourceFor(16)), 16));
write('tray/trayTemplate@2x.png', await render(glyphOnlyTemplate(sourceFor(32)), 32));

console.log(`Icons written to ${outDir}`);
