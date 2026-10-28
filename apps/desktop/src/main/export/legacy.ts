import { SESSION_FILES } from '@scrim/core';
import type { Dirent } from 'node:fs';
import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface LegacyFolder {
  folder: string;
  name: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Working folders that an earlier version left inside the folder for finished videos: folders
 * named `<name>.scrim` that hold a session file. Only looks.
 */
export async function findLegacyFolders(destination: string): Promise<LegacyFolder[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(destination, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: LegacyFolder[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.scrim')) continue;
    const folder = join(destination, entry.name);
    if (await exists(join(folder, SESSION_FILES.session))) {
      found.push({ folder, name: entry.name.slice(0, -'.scrim'.length) });
    }
  }
  return found;
}

async function sizeOf(folder: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      const inner = await sizeOf(path);
      files += inner.files;
      bytes += inner.bytes;
    } else {
      files += 1;
      bytes += (await stat(path)).size;
    }
  }
  return { files, bytes };
}

export interface MoveDeps {
  projectsRoot: string;
  /** Called after a folder moved, so the session list follows it. */
  moved: (from: string, to: string) => Promise<void>;
}

export interface MoveResult {
  moved: number;
  failed: number;
}

async function freeName(root: string, name: string): Promise<string> {
  let candidate = join(root, `${name}.scrim`);
  for (let n = 2; await exists(candidate); n += 1)
    candidate = join(root, `${name} ${String(n)}.scrim`);
  return candidate;
}

/**
 * Moves old working folders out of the folder for finished videos into the projects folder. A
 * folder is renamed when both are on the same drive. Across drives it is copied, compared file
 * for file and byte for byte, and only then is the original removed, because that is the only
 * way to move between drives. If anything differs the copy is thrown away and the original stays.
 * Nothing already in the projects folder is replaced.
 */
export async function moveLegacyFolders(
  folders: readonly LegacyFolder[],
  deps: MoveDeps,
): Promise<MoveResult> {
  const result: MoveResult = { moved: 0, failed: 0 };
  await mkdir(deps.projectsRoot, { recursive: true });
  for (const entry of folders) {
    const target = await freeName(deps.projectsRoot, entry.name);
    try {
      try {
        await rename(entry.folder, target);
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
        if (code !== 'EXDEV') throw error;
        await cp(entry.folder, target, { recursive: true, errorOnExist: true, force: false });
        const before = await sizeOf(entry.folder);
        const after = await sizeOf(target);
        if (before.files !== after.files || before.bytes !== after.bytes) {
          await rm(target, { recursive: true, force: true });
          throw new Error('The copy does not match the original.', { cause: error });
        }
        await rm(entry.folder, { recursive: true, force: true });
      }
      await deps.moved(entry.folder, target);
      result.moved += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
