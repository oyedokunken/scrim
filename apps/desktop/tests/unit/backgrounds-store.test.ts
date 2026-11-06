import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBackgroundHandlers,
  createBackgroundStore,
  sniffImage,
  type BackgroundDeps,
} from '../../src/main/backgrounds/store';
import {
  MAX_BACKGROUNDS,
  MAX_BACKGROUND_BYTES,
  backgroundsContract,
  customBackgroundId,
  customBackgroundOf,
} from '../../src/shared/backgrounds-contract';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const EXE = Buffer.from('MZ\u0090\u0000\u0003\u0000', 'latin1');

const DIR = join('C:', 'data', 'backgrounds');

/** A made up disk: files by path, and a picked file the dialog will answer with. */
function setup(picked: { path: string; bytes: Buffer } | null, ids: string[] = []) {
  const files = new Map<string, Buffer>();
  const queue = [...ids];
  if (picked !== null) files.set(picked.path, picked.bytes);
  const deps: BackgroundDeps = {
    dir: () => DIR,
    choose: () => Promise.resolve(picked?.path ?? null),
    newId: () => queue.shift() ?? '00000000-0000-4000-8000-000000000000',
    fs: {
      mkdir: () => Promise.resolve(),
      readdir: (path) =>
        Promise.resolve(
          [...files.keys()]
            .filter((file) => file.startsWith(path + sep))
            .map((file) => file.slice(path.length + 1)),
        ),
      stat: (path) => {
        const data = files.get(path);
        return data === undefined
          ? Promise.reject(new Error('missing'))
          : Promise.resolve({ size: data.length, isFile: true });
      },
      readFile: (path) => {
        const data = files.get(path);
        return data === undefined ? Promise.reject(new Error('missing')) : Promise.resolve(data);
      },
      writeNew: (path, data) => {
        if (files.has(path)) return Promise.reject(new Error('exists'));
        files.set(path, data);
        return Promise.resolve();
      },
      writeReplace: (path, data) => {
        files.set(path, Buffer.from(data));
        return Promise.resolve();
      },
      remove: (path) => {
        files.delete(path);
        return Promise.resolve();
      },
      existsSync: (path) => files.has(path),
    },
  };
  return { store: createBackgroundStore(deps), files };
}

const ID = '3f9c2a1e-8d4b-4c7a-9e21-0b5d6a7c8e90';

describe('sniffImage', () => {
  it('reads the kind from the first bytes', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPG)).toBe('jpeg');
    expect(sniffImage(WEBP)).toBe('webp');
  });

  it('refuses anything else, whatever the file is called', () => {
    expect(sniffImage(EXE)).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    expect(sniffImage(Buffer.from('RIFF....WAVE'))).toBeNull();
  });
});

describe('the background store', () => {
  it('copies a picked image into its own folder and never links to the original', async () => {
    const picked = { path: join(DIR, '..', 'Pictures', 'wall paper.png'), bytes: PNG };
    const { store, files } = setup(picked, [ID]);
    const outcome = await store.add();
    expect(outcome).toEqual({ ok: true, background: { id: ID, name: 'wall paper' } });
    expect(files.get(join(DIR, `${ID}.png`))).toEqual(PNG);
    // The original is still where it was, untouched.
    expect(files.get(picked.path)).toEqual(PNG);
    expect(store.pathOf(ID)).toBe(join(DIR, `${ID}.png`));
    expect(await store.list()).toEqual([{ id: ID, name: 'wall paper' }]);
  });

  it('keeps a JPG and a WebP under their own extension', async () => {
    const jpg = setup({ path: 'C:\\a\\x.jpeg', bytes: JPG }, [ID]);
    await jpg.store.add();
    expect(jpg.store.pathOf(ID)).toBe(join(DIR, `${ID}.jpg`));
    const webp = setup({ path: 'C:\\a\\x.webp', bytes: WEBP }, [ID]);
    await webp.store.add();
    expect(webp.store.pathOf(ID)).toBe(join(DIR, `${ID}.webp`));
  });

  it('does nothing when the dialog is cancelled', async () => {
    const { store } = setup(null);
    expect(await store.add()).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(await store.list()).toEqual([]);
  });

  it('judges the file by its content, so an executable named .png is refused', async () => {
    const { store, files } = setup({ path: 'C:\\a\\evil.png', bytes: EXE }, [ID]);
    const outcome = await store.add();
    expect(outcome).toMatchObject({ ok: false, reason: 'type' });
    expect([...files.keys()].some((file) => file.startsWith(DIR))).toBe(false);
  });

  it('refuses a picture over the size limit before reading it', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_BACKGROUND_BYTES)]);
    const { store, files } = setup({ path: 'C:\\a\\big.png', bytes: big }, [ID]);
    expect(await store.add()).toMatchObject({ ok: false, reason: 'size' });
    expect([...files.keys()].some((file) => file.startsWith(DIR))).toBe(false);
  });

  it('keeps at most the limit', async () => {
    const { store, files } = setup({ path: 'C:\\a\\x.png', bytes: PNG });
    for (let i = 0; i < MAX_BACKGROUNDS; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      files.set(join(DIR, `${id}.png`), PNG);
    }
    expect(await store.add()).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('reads a picture back as a data URL of its real type, and null when it is gone', async () => {
    const { store } = setup({ path: 'C:\\a\\x.jpg', bytes: JPG }, [ID]);
    await store.add();
    const url = await store.read(ID);
    expect(url).toBe(`data:image/jpeg;base64,${JPG.toString('base64')}`);
    expect(await store.read('11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('removes the copy and its name, and says false for one it does not have', async () => {
    const { store, files } = setup({ path: 'C:\\a\\x.png', bytes: PNG }, [ID]);
    await store.add();
    expect(await store.remove(ID)).toBe(true);
    expect(files.has(join(DIR, `${ID}.png`))).toBe(false);
    expect(store.pathOf(ID)).toBeUndefined();
    expect(await store.list()).toEqual([]);
    expect(await store.remove(ID)).toBe(false);
  });

  it('answers the typed calls through the handlers', async () => {
    const { store } = setup({ path: 'C:\\a\\x.png', bytes: PNG }, [ID]);
    const handlers = createBackgroundHandlers(store);
    const added = await handlers['backgrounds:add']();
    expect(backgroundsContract['backgrounds:add'].output.safeParse(added).success).toBe(true);
    const listed = await handlers['backgrounds:list']();
    expect(backgroundsContract['backgrounds:list'].output.safeParse(listed).success).toBe(true);
    const read = await handlers['backgrounds:read']({ id: ID });
    expect(backgroundsContract['backgrounds:read'].output.safeParse(read).success).toBe(true);
    expect(await handlers['backgrounds:remove']({ id: ID })).toBe(true);
  });
});

describe('the background contract', () => {
  it('accepts only a well formed id and nothing extra', () => {
    const input = backgroundsContract['backgrounds:read'].input;
    expect(input.safeParse({ id: ID }).success).toBe(true);
    expect(input.safeParse({ id: '..\\..\\secret' }).success).toBe(false);
    expect(input.safeParse({ id: `${ID}/../x` }).success).toBe(false);
    expect(input.safeParse({ id: ID, path: 'C:\\x' }).success).toBe(false);
    expect(backgroundsContract['backgrounds:remove'].input.safeParse({ id: 'nope' }).success).toBe(
      false,
    );
  });

  it('refuses a result that is not a PNG, JPG or WebP data URL', () => {
    const output = backgroundsContract['backgrounds:read'].output;
    expect(output.safeParse('data:image/svg+xml;base64,AAAA').success).toBe(false);
    expect(output.safeParse('file:///C:/secret.png').success).toBe(false);
    expect(output.safeParse('data:image/png;base64,AAAA').success).toBe(true);
    expect(output.safeParse(null).success).toBe(true);
  });

  it('refuses a picked file that is not named by the dialog (no path input at all)', () => {
    expect(backgroundsContract['backgrounds:add'].input.safeParse(undefined).success).toBe(true);
    expect(
      backgroundsContract['backgrounds:add'].input.safeParse({ path: 'C:\\x.png' }).success,
    ).toBe(false);
  });

  it('maps a stored background id to the image and back', () => {
    expect(customBackgroundId(ID)).toBe(`image:${ID}`);
    expect(customBackgroundOf(`image:${ID}`)).toBe(ID);
    expect(customBackgroundOf('deep-green')).toBeNull();
    expect(customBackgroundOf('image:../../x')).toBeNull();
  });
});
