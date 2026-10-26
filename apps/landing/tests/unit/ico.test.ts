import { describe, expect, it } from 'vitest';
import { buildIco } from '@/lib/ico';

const png = (length: number, fill: number) => new Uint8Array(length).fill(fill);

describe('buildIco', () => {
  it('writes the header, one directory entry per image and the payloads', () => {
    const ico = buildIco([
      { size: 16, png: png(10, 1) },
      { size: 32, png: png(20, 2) },
    ]);
    const view = new DataView(ico.buffer);

    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);
    expect(ico.length).toBe(6 + 32 + 10 + 20);

    expect(ico[6]).toBe(16);
    expect(view.getUint32(6 + 8, true)).toBe(10);
    expect(view.getUint32(6 + 12, true)).toBe(38);
    expect(ico[22]).toBe(32);
    expect(view.getUint32(22 + 8, true)).toBe(20);
    expect(view.getUint32(22 + 12, true)).toBe(48);

    expect(ico[38]).toBe(1);
    expect(ico[48]).toBe(2);
  });

  it('stores 256 pixels as zero', () => {
    const ico = buildIco([{ size: 256, png: png(4, 9) }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });

  it('rejects an empty list and out of range sizes', () => {
    expect(() => buildIco([])).toThrow(RangeError);
    expect(() => buildIco([{ size: 0, png: png(1, 0) }])).toThrow(RangeError);
    expect(() => buildIco([{ size: 300, png: png(1, 0) }])).toThrow(RangeError);
  });
});
