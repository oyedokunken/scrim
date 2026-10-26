import { sessionFileSchema, SESSION_FILES, type SessionFile } from '@scrim/core';
import { join } from 'node:path';
import { z } from 'zod';
import type { ServiceFs } from './fs-adapter';

export type ReadSessionResult =
  { ok: true; session: SessionFile } | { ok: false; reason: 'missing' | 'invalid' };

/** Reads and validates `session.json`. A missing or damaged file is a result, never a throw. */
export async function readSession(fs: ServiceFs, folder: string): Promise<ReadSessionResult> {
  let text: string;
  try {
    text = await fs.readText(join(folder, SESSION_FILES.session));
  } catch {
    return { ok: false, reason: 'missing' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const parsed = sessionFileSchema.safeParse(json);
  return parsed.success ? { ok: true, session: parsed.data } : { ok: false, reason: 'invalid' };
}

/** Rewrites `session.json` atomically, so a crash leaves the last whole copy. */
export function writeSession(fs: ServiceFs, folder: string, session: SessionFile): Promise<void> {
  return fs.writeJsonAtomic(join(folder, SESSION_FILES.session), sessionFileSchema.parse(session));
}

/** The folders Scrim has recorded into, so recovery can find sessions in any destination. */
export interface SessionIndex {
  list(): Promise<string[]>;
  add(folder: string): Promise<void>;
  remove(folder: string): Promise<void>;
}

const indexSchema = z.object({ version: z.literal(1), folders: z.array(z.string()) });
const MAX_INDEXED = 200;

/** An index kept in one JSON file, paths only. */
export function createSessionIndex(file: string, fs: ServiceFs): SessionIndex {
  const load = async (): Promise<string[]> => {
    try {
      const parsed = indexSchema.safeParse(JSON.parse(await fs.readText(file)));
      return parsed.success ? parsed.data.folders : [];
    } catch {
      return [];
    }
  };
  const save = (folders: string[]): Promise<void> =>
    fs.writeJsonAtomic(file, { version: 1, folders: folders.slice(-MAX_INDEXED) });

  return {
    list: load,
    async add(folder) {
      const folders = (await load()).filter((entry) => entry !== folder);
      await save([...folders, folder]);
    },
    async remove(folder) {
      await save((await load()).filter((entry) => entry !== folder));
    },
  };
}
