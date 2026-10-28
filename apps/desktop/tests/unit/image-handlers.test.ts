import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createImageHandlers,
  decodePngDataUrl,
  editedPath,
  pngSize,
  type ImageDeps,
} from '../../src/main/ipc/image-handlers';
import { contract, events } from '../../src/shared/ipc-contract';

const FOLDER = process.platform === 'win32' ? 'C:\\Pictures\\Scrim' : '/pictures/Scrim';
const inFolder = (name: string) => join(FOLDER, name);

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('data'),
]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;

/** The first 24 bytes of a PNG of this size. */
function header(width: number, height: number): Buffer {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

function setup(
  taken: string[] = [],
  files: { name: string; modifiedMs: number; bytes: number }[] = [],
  shareFn: ImageDeps['share'] = vi.fn(() => Promise.resolve()),
) {
  const deps: ImageDeps = {
    platform: process.platform,
    screenshotFolder: () => FOLDER,
    readFile: vi.fn(() => Promise.resolve(PNG)),
    writeNewFile: vi.fn(() => Promise.resolve()),
    writeChosenFile: vi.fn(() => Promise.resolve()),
    exists: vi.fn((path: string) => Promise.resolve(taken.includes(path))),
    copyImage: vi.fn(),
    chooseSavePath: vi.fn(() => Promise.resolve<string | null>(inFolder('chosen.png'))),
    startDrag: vi.fn(),
    trash: vi.fn(() => Promise.resolve()),
    share: shareFn,
    listFolder: vi.fn(() => Promise.resolve(files)),
    readHead: vi.fn(() => Promise.resolve(header(800, 600))),
    thumbnail: vi.fn(() => 'data:image/png;base64,AA=='),
  };
  return { handlers: createImageHandlers(deps), deps };
}

describe('decodePngDataUrl', () => {
  it('returns the bytes of a png', () => {
    expect(decodePngDataUrl(PNG_URL).equals(PNG)).toBe(true);
  });

  it('refuses another type, and text that is not a png', () => {
    expect(() => decodePngDataUrl(`data:image/jpeg;base64,${PNG.toString('base64')}`)).toThrow();
    expect(() =>
      decodePngDataUrl(`data:image/png;base64,${Buffer.from('hello world').toString('base64')}`),
    ).toThrow();
  });
});

describe('editedPath', () => {
  it('adds -edited next to the original', async () => {
    expect(await editedPath(inFolder('shot.png'), () => Promise.resolve(false))).toBe(
      inFolder('shot-edited.png'),
    );
  });

  it('counts up when the name is taken, and never reuses a name', async () => {
    const taken = [inFolder('shot-edited.png'), inFolder('shot-edited-2.png')];
    const exists = (path: string) => Promise.resolve(taken.includes(path));
    expect(await editedPath(inFolder('shot.png'), exists)).toBe(inFolder('shot-edited-3.png'));
  });

  it('does not stack the suffix when an edited file is edited again', async () => {
    expect(await editedPath(inFolder('shot-edited.png'), () => Promise.resolve(false))).toBe(
      inFolder('shot-edited.png'),
    );
  });
});

describe('the image handlers', () => {
  it('reads a screenshot as a png data url', async () => {
    const { handlers } = setup();
    expect(await handlers['image:read']({ path: inFolder('a.png') })).toBe(PNG_URL);
  });

  it('refuses paths outside the screenshots folder, other types and traversal', async () => {
    const { handlers, deps } = setup();
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    await expect(handlers['image:read']({ path: outside })).rejects.toThrow();
    await expect(handlers['image:read']({ path: inFolder('a.txt') })).rejects.toThrow();
    await expect(
      handlers['image:read']({ path: join(FOLDER, '..', 'other.png') }),
    ).rejects.toThrow();
    await expect(handlers['image:read']({ path: 'relative.png' })).rejects.toThrow();
    await expect(handlers['image:delete']({ path: outside })).rejects.toThrow();
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.trash).not.toHaveBeenCalled();
  });

  it('saves an edit under a new name, copies it when asked and never writes the original', async () => {
    const { handlers, deps } = setup();
    const result = await handlers['image:save-edited']({
      sourcePath: inFolder('a.png'),
      dataUrl: PNG_URL,
      copy: true,
    });
    expect(result).toEqual({ path: inFolder('a-edited.png'), copied: true });
    expect(deps.writeNewFile).toHaveBeenCalledTimes(1);
    expect(deps.writeNewFile).toHaveBeenCalledWith(inFolder('a-edited.png'), PNG);
    expect(deps.writeChosenFile).not.toHaveBeenCalled();
    expect(deps.copyImage).toHaveBeenCalledWith(PNG);
  });

  it('does not copy when copy is off, and picks the next name when the first is taken', async () => {
    const { handlers, deps } = setup([inFolder('a-edited.png')]);
    const result = await handlers['image:save-edited']({
      sourcePath: inFolder('a.png'),
      dataUrl: PNG_URL,
      copy: false,
    });
    expect(result.path).toBe(inFolder('a-edited-2.png'));
    expect(deps.copyImage).not.toHaveBeenCalled();
  });

  it('refuses an edit that is not a png', async () => {
    const { handlers, deps } = setup();
    const fake = `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`;
    await expect(
      handlers['image:save-edited']({ sourcePath: inFolder('a.png'), dataUrl: fake, copy: false }),
    ).rejects.toThrow();
    expect(deps.writeNewFile).not.toHaveBeenCalled();
  });

  it('saves as the chosen file, and does nothing when the dialog is cancelled', async () => {
    const { handlers, deps } = setup();
    expect(await handlers['image:save-as']({ dataUrl: PNG_URL, name: 'my shot' })).toEqual({
      path: inFolder('chosen.png'),
    });
    expect(deps.chooseSavePath).toHaveBeenCalledWith('my shot.png');
    expect(deps.writeChosenFile).toHaveBeenCalledWith(inFolder('chosen.png'), PNG);

    vi.mocked(deps.chooseSavePath).mockResolvedValueOnce(null);
    expect(await handlers['image:save-as']({ dataUrl: PNG_URL, name: 'x' })).toEqual({
      path: null,
    });
    expect(deps.writeChosenFile).toHaveBeenCalledTimes(1);
  });

  it('strips folders and reserved characters from the suggested name', async () => {
    const { handlers, deps } = setup();
    await handlers['image:save-as']({ dataUrl: PNG_URL, name: '..\\..\\evil:name?.png' });
    expect(vi.mocked(deps.chooseSavePath).mock.calls[0]?.[0]).toBe('evil_name_.png');
  });

  it('starts a drag, copies, and moves a deleted file to the recycle bin', async () => {
    const { handlers, deps } = setup();
    await handlers['image:drag']({ path: inFolder('a.png') });
    expect(deps.startDrag).toHaveBeenCalledWith(inFolder('a.png'));
    await handlers['image:copy']({ dataUrl: PNG_URL });
    expect(deps.copyImage).toHaveBeenCalledWith(PNG);
    await handlers['image:delete']({ path: inFolder('a.png') });
    expect(deps.trash).toHaveBeenCalledWith(inFolder('a.png'));
  });
});

describe('the image contract', () => {
  it('accepts only png data urls and strict objects', () => {
    expect(contract['image:copy'].input.safeParse({ dataUrl: PNG_URL }).success).toBe(true);
    expect(
      contract['image:copy'].input.safeParse({ dataUrl: 'data:image/jpeg;base64,AA==' }).success,
    ).toBe(false);
    expect(contract['image:copy'].input.safeParse({ dataUrl: PNG_URL, extra: 1 }).success).toBe(
      false,
    );
    expect(
      contract['image:save-edited'].input.safeParse({ sourcePath: 'a.png', dataUrl: PNG_URL })
        .success,
    ).toBe(false);
  });

  it('never lets the page choose where an edit goes', () => {
    const keys = Object.keys(contract['image:save-edited'].input.shape);
    expect(keys.sort()).toEqual(['copy', 'dataUrl', 'sourcePath']);
  });
});

describe('the screenshot taken event', () => {
  it('carries the path and size, and nothing else', () => {
    const shot = { path: 'a.png', width: 10, height: 10 };
    expect(events['screenshot:taken'].safeParse(shot).success).toBe(true);
    expect(events['screenshot:taken'].safeParse({ ...shot, extra: 1 }).success).toBe(false);
    expect(events['screenshot:taken'].safeParse({ ...shot, width: 0 }).success).toBe(false);
  });
});

describe('pngSize', () => {
  it('reads the size from a PNG header', () => {
    expect(pngSize(header(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('refuses bytes that are not a PNG header', () => {
    expect(pngSize(Buffer.from('not a png at all, just text'))).toBeNull();
    expect(pngSize(header(0, 10))).toBeNull();
    expect(pngSize(PNG)).toBeNull();
  });
});

describe('image:list', () => {
  const files = [
    { name: 'old.png', modifiedMs: 1000, bytes: 10 },
    { name: 'notes.txt', modifiedMs: 5000, bytes: 10 },
    { name: 'new.PNG', modifiedMs: 3000, bytes: 20 },
  ];

  it('lists only PNG files, newest first, with their size', async () => {
    const { handlers } = setup([], files);
    const list = await handlers['image:list'](undefined);
    expect(list.map((entry) => entry.name)).toEqual(['new.PNG', 'old.png']);
    expect(list[0]).toMatchObject({
      path: inFolder('new.PNG'),
      width: 800,
      height: 600,
      bytes: 20,
    });
  });

  it('is empty when the folder is missing or empty', async () => {
    expect(await setup().handlers['image:list'](undefined)).toEqual([]);
  });

  it('skips a file whose header cannot be read', async () => {
    const { handlers, deps } = setup([], files);
    vi.mocked(deps.readHead).mockRejectedValueOnce(new Error('locked'));
    expect(await handlers['image:list'](undefined)).toHaveLength(1);
  });

  it('returns at most 500 entries', async () => {
    const many = Array.from({ length: 600 }, (_, index) => ({
      name: `s${String(index)}.png`,
      modifiedMs: index,
      bytes: 1,
    }));
    expect(await setup([], many).handlers['image:list'](undefined)).toHaveLength(500);
  });
});

describe('image:thumbnail', () => {
  it('makes a small picture of a screenshot', async () => {
    const { handlers, deps } = setup();
    const url = await handlers['image:thumbnail']({ path: inFolder('a.png') });
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(deps.thumbnail).toHaveBeenCalledWith(inFolder('a.png'), 320);
  });

  it('refuses a path outside the screenshots folder', () => {
    const { handlers } = setup();
    expect(() => handlers['image:thumbnail']({ path: join(FOLDER, '..', 'a.png') })).toThrow();
  });
});

describe('image:share', () => {
  it('opens the share sheet for a screenshot in the folder', async () => {
    const share = vi.fn(() => Promise.resolve());
    const { handlers } = setup([], [], share);
    await handlers['image:share']({ path: inFolder('a.png') });
    expect(share).toHaveBeenCalledWith(inFolder('a.png'));
  });

  it('refuses a file outside the folder, and fails plainly when there is no share sheet', async () => {
    const { handlers } = setup(
      [],
      [],
      vi.fn(() => Promise.resolve()),
    );
    await expect(handlers['image:share']({ path: join(FOLDER, '..', 'a.png') })).rejects.toThrow();
    const none = setup([], [], null);
    await expect(none.handlers['image:share']({ path: inFolder('a.png') })).rejects.toThrow();
  });
});
