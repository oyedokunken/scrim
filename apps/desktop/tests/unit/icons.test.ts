import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '../../resources/icons');
const read = (file: string) => readFileSync(join(dir, file));

/** Width and height from the PNG header. */
function pngSize(png: Buffer): [number, number] {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('generated icon files', () => {
  it('has a Windows ico with every size, each a valid png', () => {
    const ico = read('icon.ico');
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + i * 16;
      const size = ico[entry] === 0 ? 256 : (ico[entry] ?? 0);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(pngSize(ico.subarray(offset, offset + length))).toEqual([size, size]);
      sizes.push(size);
    }
    expect(sizes).toEqual([16, 20, 24, 32, 40, 48, 64, 256]);
  });

  it('has a macOS icns from 16 to 1024, each a valid png', () => {
    const icns = read('icon.icns');
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const found: Record<string, number> = {};
    for (let offset = 8; offset < icns.length;) {
      const type = icns.subarray(offset, offset + 4).toString('ascii');
      const length = icns.readUInt32BE(offset + 4);
      const [width] = pngSize(icns.subarray(offset + 8, offset + length));
      found[type] = width;
      offset += length;
    }
    expect(found).toEqual({
      icp4: 16,
      icp5: 32,
      icp6: 64,
      ic07: 128,
      ic08: 256,
      ic09: 512,
      ic10: 1024,
      ic11: 32,
      ic12: 64,
      ic13: 256,
      ic14: 512,
    });
  });

  it.each([16, 24, 32, 48, 64, 128, 256, 512])(
    'has a %i px Linux png named for builder',
    (size) => {
      expect(pngSize(read(`linux/${size}x${size}.png`))).toEqual([size, size]);
    },
  );

  it.each([16, 24, 32])('has idle and recording tray icons at %i px', (size) => {
    expect(pngSize(read(`tray/tray-${size}.png`))).toEqual([size, size]);
    expect(pngSize(read(`tray/tray-recording-${size}.png`))).toEqual([size, size]);
    expect(read(`tray/tray-recording-${size}.png`).equals(read(`tray/tray-${size}.png`))).toBe(
      false,
    );
  });

  it('has macOS template tray images named for the system and a 2x', () => {
    expect(pngSize(read('tray/trayTemplate.png'))).toEqual([16, 16]);
    expect(pngSize(read('tray/trayTemplate@2x.png'))).toEqual([32, 32]);
  });

  it('keeps the macOS artwork inside the grid with transparent padding', async () => {
    const { data, info } = await sharp(read('icon-mac-512.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] ?? 0;
    expect([info.width, info.height]).toEqual([512, 512]);
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(256, 256)).toBe(255);
    // 824 of 1024 is about 80 percent, so 51 px of padding on each side at 512.
    expect(alphaAt(40, 256)).toBe(0);
    expect(alphaAt(60, 256)).toBeGreaterThan(0);
  });

  it('draws the tray template as black on a transparent background', async () => {
    const { data } = await sharp(read('tray/trayTemplate@2x.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) > 200) {
        opaque += 1;
        expect([data[i], data[i + 1], data[i + 2]]).toEqual([0, 0, 0]);
      }
    }
    expect(opaque).toBeGreaterThan(0);
    expect(data[3]).toBe(0);
  });

  it('draws the recording dot in record red and the idle icon without it', async () => {
    const pixel = async (file: string) => {
      const { data, info } = await sharp(read(file))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => [
        ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
      ];
      return at(Math.round(info.width * 0.76), Math.round(info.height * 0.76));
    };
    expect(await pixel('tray/tray-recording-32.png')).toEqual([255, 59, 48]);
    expect(await pixel('tray/tray-32.png')).not.toEqual([255, 59, 48]);
  });
});
