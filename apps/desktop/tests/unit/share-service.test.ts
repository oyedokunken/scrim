import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createShareService, type ShareServiceDeps } from '../../src/main/share/share-service';
import { LARGE_VIDEO_BYTES, shareContract } from '../../src/shared/share-contract';

const ROOT = process.platform === 'win32' ? 'C:\\Data' : '/data';
const VIDEOS = join(ROOT, 'Videos');
const SHOTS = join(ROOT, 'Pictures');
const CACHE = join(ROOT, 'cache');
const TEMP = join(CACHE, 'shares');
const OUTSIDE = join(process.platform === 'win32' ? 'C:\\Other' : '/other', 'secret.png');

function setup(over: Partial<ShareServiceDeps> = {}) {
  const sizes = new Map<string, number>([
    [join(VIDEOS, 'Take 1.mp4'), 5_000_000],
    [join(VIDEOS, 'Big.mp4'), LARGE_VIDEO_BYTES + 1],
    [join(SHOTS, 'Shot.png'), 1000],
    [OUTSIDE, 10],
  ]);
  const files: Record<string, { path: string; media: 'video' | 'image'; name: string }> = {
    video: { path: join(VIDEOS, 'Take 1.mp4'), media: 'video', name: 'Take 1' },
    big: { path: join(VIDEOS, 'Big.mp4'), media: 'video', name: 'Big' },
    shot: { path: join(SHOTS, 'Shot.png'), media: 'image', name: 'Shot' },
    outside: { path: OUTSIDE, media: 'image', name: 'secret' },
    traversal: {
      path: join(SHOTS, '..', '..', 'other', 'secret.png'),
      media: 'image',
      name: 'x',
    },
    relative: { path: 'Pictures/Shot.png', media: 'image', name: 'x' },
  };
  const base = {
    platform: process.platform,
    libraryFile: vi.fn((id: string) => files[id]),
    reviewFile: vi.fn(() => Promise.resolve('not-ready' as const)),
    allowedRoots: () => [VIDEOS, SHOTS, CACHE],
    tempDir: () => TEMP,
    fileSize: vi.fn((path: string) => Promise.resolve(sizes.get(path))),
    writeFile: vi.fn((path: string, data: Buffer) => {
      sizes.set(path, data.length);
      return Promise.resolve();
    }),
    makeDir: vi.fn(() => Promise.resolve()),
    listDir: vi.fn(() => Promise.resolve([] as { name: string; modifiedMs: number }[])),
    remove: vi.fn(() => Promise.resolve()),
    now: () => 10_000_000,
    nativeShare: vi.fn(() => Promise.resolve()),
    copyFile: vi.fn(() => Promise.resolve()),
    // The argument is typed so the tests can read what was copied.
    copyImage: vi.fn((png: Buffer) => {
      expect(png.length).toBeGreaterThan(0);
    }),
    readFile: vi.fn(() => Promise.resolve(Buffer.from('png'))),
    copyText: vi.fn(),
    openMail: vi.fn(() => Promise.resolve()),
    reveal: vi.fn(),
    startDrag: vi.fn(),
    makeSmaller: vi.fn((_path: string, dir: string) =>
      Promise.resolve(join(dir, 'Big (small).mp4')),
    ),
  } satisfies ShareServiceDeps;
  return { service: createShareService({ ...base, ...over }), deps: base };
}

const lib = (id: string) => ({ kind: 'library' as const, id });

describe('what a source may point at', () => {
  it('refuses an id that is not in the library', async () => {
    const { service, deps } = setup();
    const result = await service.run(lib('nope'), 'app');
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
    expect(deps.nativeShare).not.toHaveBeenCalled();
  });

  it('refuses a file outside the allowed folders, a dot dot path and a relative path', async () => {
    const { service, deps } = setup();
    for (const id of ['outside', 'traversal', 'relative']) {
      expect(await service.run(lib(id), 'app')).toMatchObject({ ok: false, reason: 'missing' });
      expect(await service.run(lib(id), 'copy-file')).toMatchObject({ ok: false });
      expect(await service.run(lib(id), 'email')).toMatchObject({ ok: false });
    }
    expect(deps.nativeShare).not.toHaveBeenCalled();
    expect(deps.copyFile).not.toHaveBeenCalled();
    expect(deps.openMail).not.toHaveBeenCalled();
    await service.drag(lib('outside'));
    expect(deps.startDrag).not.toHaveBeenCalled();
  });

  it('tells a file that is gone from a file that is not allowed, in plain words', async () => {
    const { service } = setup({ fileSize: vi.fn(() => Promise.resolve(undefined)) });
    const result = await service.run(lib('video'), 'app');
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
    expect(result.ok ? '' : result.message).toContain('moved or deleted');
  });

  it('says isAllowed only for absolute paths inside the roots', () => {
    const { service } = setup();
    expect(service.isAllowed(join(VIDEOS, 'a.mp4'))).toBe(true);
    expect(service.isAllowed(join(VIDEOS, '..', 'x.mp4'))).toBe(false);
    expect(service.isAllowed(`${VIDEOS}-sibling${join('/', 'a.mp4')}`)).toBe(false);
    expect(service.isAllowed('a.mp4')).toBe(false);
    expect(service.isAllowed(`${join(VIDEOS, 'a.mp4')}\0.png`)).toBe(false);
  });
});

describe('the actions', () => {
  it('shares with the system sheet, copies the file, copies a path and shows the folder', async () => {
    const { service, deps } = setup();
    expect(await service.run(lib('video'), 'app')).toMatchObject({ ok: true });
    expect(deps.nativeShare).toHaveBeenCalledWith(join(VIDEOS, 'Take 1.mp4'));
    expect(await service.run(lib('video'), 'copy-file')).toMatchObject({ ok: true });
    expect(deps.copyFile).toHaveBeenCalledWith(join(VIDEOS, 'Take 1.mp4'));
    await service.run(lib('video'), 'copy-path');
    expect(deps.copyText).toHaveBeenCalledWith(join(VIDEOS, 'Take 1.mp4'));
    await service.run(lib('video'), 'reveal');
    expect(deps.reveal).toHaveBeenCalledWith(join(VIDEOS, 'Take 1.mp4'));
  });

  it('copies an image only for a screenshot', async () => {
    const { service, deps } = setup();
    expect(await service.run(lib('shot'), 'copy-image')).toMatchObject({ ok: true });
    expect(deps.copyImage).toHaveBeenCalledTimes(1);
    expect(await service.run(lib('video'), 'copy-image')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('opens the mail app with a subject and puts the file on the clipboard to paste', async () => {
    const { service, deps } = setup();
    const result = await service.run(lib('video'), 'email');
    expect(deps.copyFile).toHaveBeenCalled();
    expect(deps.openMail).toHaveBeenCalledWith('Recording: Take 1.mp4');
    expect(result).toEqual({ ok: true, message: 'File copied. Paste it into your email.' });
  });

  it('shows the folder instead when the system cannot copy a file', async () => {
    const { service, deps } = setup({ copyFile: null });
    const result = await service.run(lib('shot'), 'email');
    expect(deps.reveal).toHaveBeenCalled();
    expect(result.ok && result.message).toContain('Attach the file');
    expect(await service.run(lib('shot'), 'copy-file')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('says so when there is no share sheet', async () => {
    const { service } = setup({ nativeShare: null });
    expect(await service.run(lib('video'), 'app')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
    const info = await service.info(lib('video'));
    expect(info.ok && info.can.app).toBe(false);
  });

  it('turns a failing system call into a plain message', async () => {
    const { service } = setup({ nativeShare: vi.fn(() => Promise.reject(new Error('boom'))) });
    const result = await service.run(lib('video'), 'app');
    expect(result).toEqual({
      ok: false,
      reason: 'failed',
      message: 'Scrim could not do that. Try again.',
    });
  });

  it('drags the file out', async () => {
    const { service, deps } = setup();
    await service.drag(lib('shot'));
    expect(deps.startDrag).toHaveBeenCalledWith(join(SHOTS, 'Shot.png'));
  });
});

describe('large videos', () => {
  it('flags a video over 25 MB and gives the size', async () => {
    const { service } = setup();
    const small = await service.info(lib('video'));
    const big = await service.info(lib('big'));
    expect(small).toMatchObject({ ok: true, large: false, bytes: 5_000_000, media: 'video' });
    expect(big).toMatchObject({ ok: true, large: true, bytes: LARGE_VIDEO_BYTES + 1 });
  });

  it('makes a smaller copy in the cache, shares that, and leaves the original alone', async () => {
    const { service, deps } = setup();
    const result = await service.run(lib('big'), 'smaller');
    expect(deps.makeSmaller).toHaveBeenCalledWith(join(VIDEOS, 'Big.mp4'), TEMP);
    expect(deps.nativeShare).toHaveBeenCalledWith(join(TEMP, 'Big (small).mp4'));
    expect(deps.remove).not.toHaveBeenCalledWith(join(VIDEOS, 'Big.mp4'));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.message).toContain('original is unchanged');
  });

  it('refuses a smaller copy of a screenshot', async () => {
    const { service } = setup();
    expect(await service.run(lib('shot'), 'smaller')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('refuses a smaller copy that lands outside the allowed folders', async () => {
    const { service, deps } = setup({ makeSmaller: vi.fn(() => Promise.resolve(OUTSIDE)) });
    expect(await service.run(lib('big'), 'smaller')).toMatchObject({ ok: false, reason: 'failed' });
    expect(deps.nativeShare).not.toHaveBeenCalled();
  });
});

describe('an edited screenshot', () => {
  const edited = {
    kind: 'edited' as const,
    dataUrl: `data:image/png;base64,${Buffer.from('final picture').toString('base64')}`,
    name: 'Shot-edited',
  };

  it('is written to a temporary PNG in the cache, then shared from there', async () => {
    const { service, deps } = setup();
    const result = await service.run(edited, 'app');
    expect(result).toMatchObject({ ok: true });
    const written = deps.writeFile.mock.calls[0];
    expect(written?.[0].startsWith(TEMP)).toBe(true);
    expect(written?.[0].endsWith('Shot-edited.png')).toBe(true);
    expect(written?.[1].toString()).toBe('final picture');
    expect(deps.nativeShare).toHaveBeenCalledWith(written?.[0]);
  });

  it('copies the image without a file', async () => {
    const { service, deps } = setup();
    expect(await service.run(edited, 'copy-image')).toMatchObject({ ok: true });
    expect(deps.copyImage.mock.calls[0]?.[0].toString()).toBe('final picture');
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('cleans out temporary files older than an hour and keeps the newer ones', async () => {
    const { service, deps } = setup({
      listDir: vi.fn(() =>
        Promise.resolve([
          { name: 'old.png', modifiedMs: 10_000_000 - 2 * 60 * 60 * 1000 },
          { name: 'fresh.png', modifiedMs: 10_000_000 - 1000 },
        ]),
      ),
    });
    await service.run(edited, 'app');
    expect(deps.remove).toHaveBeenCalledWith(join(TEMP, 'old.png'));
    expect(deps.remove).not.toHaveBeenCalledWith(join(TEMP, 'fresh.png'));
  });

  it('cannot write outside the cache even with an odd name', async () => {
    const { service, deps } = setup();
    await service.run({ ...edited, name: '..\\..\\evil/../x' }, 'app');
    expect(deps.writeFile.mock.calls[0]?.[0].startsWith(TEMP)).toBe(true);
    expect(deps.writeFile.mock.calls[0]?.[0]).not.toContain('..');
  });
});

describe('a recording under review', () => {
  it('is not ready until the finished video is made', async () => {
    const { service } = setup();
    const source = { kind: 'review' as const, folder: join(ROOT, 'Projects', 'Take 1.scrim') };
    expect(await service.run(source, 'app')).toMatchObject({ ok: false, reason: 'not-ready' });
    expect(await service.info(source)).toMatchObject({ ok: false, reason: 'not-ready' });
  });

  it('shares the working copy once it exists', async () => {
    const preview = join(CACHE, 'previews', 'Take 1.mp4');
    const { service, deps } = setup({
      reviewFile: vi.fn(() => Promise.resolve({ path: preview, name: 'Take 1.mp4' })),
      fileSize: vi.fn(() => Promise.resolve(1234)),
    });
    const source = { kind: 'review' as const, folder: join(ROOT, 'Projects', 'Take 1.scrim') };
    expect(await service.run(source, 'app')).toMatchObject({ ok: true });
    expect(deps.nativeShare).toHaveBeenCalledWith(preview);
  });
});

describe('the contract', () => {
  it('rejects a source with a stray field or a data URL that is not a PNG', () => {
    const input = shareContract['share:run'].input;
    expect(input.safeParse({ source: { kind: 'library', id: 'a' }, action: 'app' }).success).toBe(
      true,
    );
    expect(
      input.safeParse({ source: { kind: 'library', id: 'a', path: 'C:\\x' }, action: 'app' })
        .success,
    ).toBe(false);
    expect(
      input.safeParse({
        source: { kind: 'edited', dataUrl: 'data:text/html;base64,AA==', name: 'x' },
        action: 'app',
      }).success,
    ).toBe(false);
    expect(
      input.safeParse({ source: { kind: 'library', id: 'a' }, action: 'format-disk' }).success,
    ).toBe(false);
  });
});
