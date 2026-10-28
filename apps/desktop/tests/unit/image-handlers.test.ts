import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createImageHandlers,
  decodePngDataUrl,
  editedPath,
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

function setup(taken: string[] = []) {
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
