import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import {
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUNDS,
  type BackgroundImage,
} from '../../shared/backgrounds-contract';
import type { Handlers } from '../ipc/dispatcher';

export type ImageKind = 'png' | 'jpeg' | 'webp';

const EXTENSION: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const KINDS: readonly ImageKind[] = ['png', 'jpeg', 'webp'];

/** What the file is, read from its first bytes and never from its name. Null for anything else. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const at = (offset: number, text: string): boolean => {
    if (bytes.length < offset + text.length) return false;
    for (let i = 0; i < text.length; i += 1) {
      if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    at(1, 'PNG') &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  return null;
}

const indexSchema = z
  .object({
    version: z.literal(1),
    names: z.record(z.string(), z.string().max(120)),
  })
  .strict();

/** The disk and the dialog behind the store, so tests run it on a made up disk. */
export interface BackgroundDeps {
  /** Scrim's own folder for these pictures, inside its app data. */
  dir: () => string;
  /** The system file dialog. Null when the person cancels. The page never supplies a path. */
  choose: () => Promise<string | null>;
  newId: () => string;
  fs: {
    mkdir: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    stat: (path: string) => Promise<{ size: number; isFile: boolean }>;
    readFile: (path: string) => Promise<Buffer>;
    /** Creates the file and fails when it exists. */
    writeNew: (path: string, data: Buffer) => Promise<void>;
    writeReplace: (path: string, data: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    existsSync: (path: string) => boolean;
  };
}

const FILE_NAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg|webp)$/;

export interface BackgroundStore {
  list: () => Promise<BackgroundImage[]>;
  add: () => ReturnType<Handlers['backgrounds:add']>;
  read: (id: string) => Promise<string | null>;
  remove: (id: string) => Promise<boolean>;
  /** Where the picture is, for the export. Undefined when it is gone. */
  pathOf: (id: string) => string | undefined;
}

/**
 * The person's own background pictures. A picked file is checked by its content and size, then copied
 * into Scrim's data folder under a new name, so the original can move or vanish and Scrim never links to it.
 */
export function createBackgroundStore(deps: BackgroundDeps): BackgroundStore {
  const indexPath = (): string => join(deps.dir(), 'index.json');

  async function readNames(): Promise<Record<string, string>> {
    try {
      const parsed = indexSchema.safeParse(
        JSON.parse((await deps.fs.readFile(indexPath())).toString('utf8')),
      );
      return parsed.success ? parsed.data.names : {};
    } catch {
      return {};
    }
  }

  async function writeNames(names: Record<string, string>): Promise<void> {
    await deps.fs.writeReplace(indexPath(), JSON.stringify({ version: 1, names }));
  }

  async function files(): Promise<{ id: string; ext: string }[]> {
    let names: string[];
    try {
      names = await deps.fs.readdir(deps.dir());
    } catch {
      return [];
    }
    return names
      .map((name) => FILE_NAME.exec(name))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ id: match[1] ?? '', ext: match[2] ?? '' }));
  }

  const pathOf = (id: string): string | undefined => {
    for (const kind of KINDS) {
      const candidate = join(deps.dir(), `${id}.${EXTENSION[kind]}`);
      if (deps.fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  };

  return {
    pathOf,
    async list() {
      const names = await readNames();
      return (await files())
        .slice(0, MAX_BACKGROUNDS)
        .map(({ id }) => ({ id, name: names[id] ?? 'Your image' }));
    },
    async add() {
      const picked = await deps.choose();
      if (picked === null) {
        return { ok: false, reason: 'cancelled', message: 'No image was chosen.' };
      }
      try {
        if ((await files()).length >= MAX_BACKGROUNDS) {
          return {
            ok: false,
            reason: 'limit',
            message: 'Scrim keeps up to 24 images. Remove one to add another.',
          };
        }
        const info = await deps.fs.stat(picked);
        if (!info.isFile) {
          return { ok: false, reason: 'type', message: 'That is not an image file.' };
        }
        if (info.size > MAX_BACKGROUND_BYTES) {
          return {
            ok: false,
            reason: 'size',
            message: 'That image is larger than 10 MB. Choose a smaller one.',
          };
        }
        const bytes = await deps.fs.readFile(picked);
        const kind = sniffImage(bytes);
        if (kind === null) {
          return {
            ok: false,
            reason: 'type',
            message: 'Choose a PNG, JPG or WebP image.',
          };
        }
        await deps.fs.mkdir(deps.dir());
        const id = deps.newId();
        await deps.fs.writeNew(join(deps.dir(), `${id}.${EXTENSION[kind]}`), bytes);
        const name = (basename(picked, extname(picked)) || 'Your image').slice(0, 120);
        const names = await readNames();
        await writeNames({ ...names, [id]: name });
        return { ok: true, background: { id, name } };
      } catch {
        return {
          ok: false,
          reason: 'failed',
          message: 'Scrim could not save that image. Check the disk has room and try again.',
        };
      }
    },
    async read(id) {
      const path = pathOf(id);
      if (path === undefined) return null;
      try {
        const bytes = await deps.fs.readFile(path);
        const kind = sniffImage(bytes);
        if (kind === null || bytes.length > MAX_BACKGROUND_BYTES) return null;
        return `data:${MIME[kind]};base64,${bytes.toString('base64')}`;
      } catch {
        return null;
      }
    },
    async remove(id) {
      const path = pathOf(id);
      if (path === undefined) return false;
      try {
        await deps.fs.remove(path);
        const names = await readNames();
        await writeNames(Object.fromEntries(Object.entries(names).filter(([key]) => key !== id)));
        return true;
      } catch {
        return false;
      }
    },
  };
}

type BackgroundHandlers = Pick<
  Handlers,
  'backgrounds:list' | 'backgrounds:add' | 'backgrounds:read' | 'backgrounds:remove'
>;

export function createBackgroundHandlers(store: BackgroundStore): BackgroundHandlers {
  return {
    'backgrounds:list': () => store.list(),
    'backgrounds:add': () => store.add(),
    'backgrounds:read': ({ id }) => store.read(id),
    'backgrounds:remove': ({ id }) => store.remove(id),
  };
}
