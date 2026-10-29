import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

/** A small flat PNG that a real decoder accepts, for tests that need files on disk. */
function flatPng(width: number, height: number, shade = 200): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, shade);
  for (let y = 0; y < height; y += 1) raw[y * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface PicturesFixture {
  /** The pictures root. Screenshots live in its `Scrim` folder. */
  root: string;
  folder: string;
  add: (name: string, modifiedSecondsAgo: number) => string;
  cleanup: () => void;
}

/** A temp pictures folder with a `Scrim` folder inside, removed afterwards. */
export function picturesFixture(): PicturesFixture {
  const root = mkdtempSync(join(tmpdir(), 'scrim-pics-'));
  const folder = join(root, 'Scrim');
  mkdirSync(folder, { recursive: true });
  return {
    root,
    folder,
    add: (name, modifiedSecondsAgo) => {
      const path = join(folder, name);
      writeFileSync(path, flatPng(160, 90));
      const when = new Date(Date.now() - modifiedSecondsAgo * 1000);
      utimesSync(path, when, when);
      return path;
    },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
