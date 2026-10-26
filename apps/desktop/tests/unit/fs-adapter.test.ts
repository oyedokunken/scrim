import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  freeBytes,
  openAppendSink,
  realAtomicFs,
  writeJsonAtomic,
  type AtomicFs,
} from '../../src/main/recording/fs-adapter';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scrim-fs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('openAppendSink', () => {
  it('appends in order, syncs and closes, and never rewrites what is there', async () => {
    const path = join(dir, 'screen.raw.webm');
    await writeFile(path, Buffer.from([1, 2, 3]));
    const sink = await openAppendSink(path);
    await sink.append(new Uint8Array([4, 5]));
    await sink.append(new Uint8Array([6]));
    await sink.sync();
    await sink.close();
    expect([...(await readFile(path))]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('creates the file when it does not exist', async () => {
    const path = join(dir, 'new.raw.webm');
    const sink = await openAppendSink(path);
    await sink.append(new Uint8Array([9]));
    await sink.close();
    expect([...(await readFile(path))]).toEqual([9]);
  });

  it('fails with the Node error code when the folder is missing', async () => {
    await expect(openAppendSink(join(dir, 'missing', 'x.webm'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('writeJsonAtomic', () => {
  it('writes the file, leaves no temp file and replaces an older copy', async () => {
    const path = join(dir, 'session.json');
    await writeJsonAtomic(path, { a: 1 });
    await writeJsonAtomic(path, { a: 2 });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ a: 2 });
    expect(await readdir(dir)).toEqual(['session.json']);
  });

  const flaky = (code: string, failures: number): { fs: AtomicFs; calls: string[] } => {
    const calls: string[] = [];
    let remaining = failures;
    const fs: AtomicFs = {
      ...realAtomicFs,
      async rename(from, to) {
        calls.push('rename');
        if (remaining > 0) {
          remaining -= 1;
          throw Object.assign(new Error(code), { code });
        }
        await realAtomicFs.rename(from, to);
      },
      sleep: () => Promise.resolve(),
    };
    return { fs, calls };
  };

  it.each(['EPERM', 'EBUSY'])('retries a rename that fails with %s', async (code) => {
    const path = join(dir, 'session.json');
    const { fs, calls } = flaky(code, 2);
    await writeJsonAtomic(path, { ok: true }, fs);
    expect(calls).toHaveLength(3);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ ok: true });
  });

  it('gives up after several attempts and removes the temp file', async () => {
    const path = join(dir, 'session.json');
    const { fs, calls } = flaky('EBUSY', 99);
    await expect(writeJsonAtomic(path, {}, fs)).rejects.toMatchObject({ code: 'EBUSY' });
    expect(calls.length).toBeGreaterThan(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not retry an error that will not go away', async () => {
    const path = join(dir, 'session.json');
    const { fs, calls } = flaky('ENOSPC', 99);
    await expect(writeJsonAtomic(path, {}, fs)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(calls).toHaveLength(1);
  });

  it('fails when the folder does not exist', async () => {
    await expect(writeJsonAtomic(join(dir, 'gone', 'session.json'), {})).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('freeBytes', () => {
  it('returns a positive number for a real folder', async () => {
    expect(await freeBytes(dir)).toBeGreaterThan(0);
  });
});
