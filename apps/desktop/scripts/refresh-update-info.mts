import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signing the installer after electron-builder wrote `latest.yml` changes the file, so the sha512 and
 * the size in that update file no longer match it, and every update would be refused as a checksum
 * error. This writes the real values for the signed file into the update file.
 *
 * The blockmap was made for the unsigned file, so it is dropped, and the `blockMapSize` line that
 * points at it is dropped with it. Without both, the updater downloads the whole installer, which
 * is slower but always correct.
 *
 * The file has a fixed shape written by electron-builder, so it is edited as text:
 *
 *   files:
 *     - url: Scrim-Setup-1.2.0.exe
 *       sha512: ...
 *       size: 123
 *   path: Scrim-Setup-1.2.0.exe
 *   sha512: ...
 */
export function refreshUpdateInfo(
  yml: string,
  fileName: string,
  sha512: string,
  size: number,
): string {
  const kept: string[] = [];
  let inEntry = false;
  let topLevelMatches = false;
  for (const original of yml.split('\n')) {
    let line = original;
    const url = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line);
    if (url !== null) inEntry = url[1] === fileName;
    else if (/^\S/.test(line)) inEntry = false;
    if (inEntry && /^\s+blockMapSize:/.test(line)) continue;
    if (inEntry && /^\s+sha512:/.test(line)) line = line.replace(/sha512:.*/, `sha512: ${sha512}`);
    else if (inEntry && /^\s+size:/.test(line))
      line = line.replace(/size:.*/, `size: ${String(size)}`);
    const path = /^path:\s*(.+?)\s*$/.exec(line);
    if (path !== null) topLevelMatches = path[1] === fileName;
    if (topLevelMatches && /^sha512:/.test(line)) line = `sha512: ${sha512}`;
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Checks that an update file describes exactly these installer bytes: the entry for the file and
 * the top level path both name it, with its real sha512 and size, and no blockMapSize is left for
 * a blockmap that does not exist. Returns the problems, empty when the file is right.
 */
export function checkUpdateInfo(yml: string, fileName: string, bytes: Uint8Array): string[] {
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const problems: string[] = [];
  let entrySha: string | null = null;
  let entrySize: string | null = null;
  let topSha: string | null = null;
  let topPath: string | null = null;
  let inEntry = false;
  for (const line of yml.split('\n')) {
    const url = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line);
    if (url !== null) inEntry = url[1] === fileName;
    else if (/^\S/.test(line)) inEntry = false;
    if (inEntry) {
      entrySha = /^\s+sha512:\s*(.+?)\s*$/.exec(line)?.[1] ?? entrySha;
      entrySize = /^\s+size:\s*(.+?)\s*$/.exec(line)?.[1] ?? entrySize;
      if (/^\s+blockMapSize:/.test(line))
        problems.push('blockMapSize is set but the blockmap is dropped');
    }
    topPath = /^path:\s*(.+?)\s*$/.exec(line)?.[1] ?? topPath;
    topSha = /^sha512:\s*(.+?)\s*$/.exec(line)?.[1] ?? topSha;
  }
  if (entrySha === null) problems.push(`no files entry for ${fileName}`);
  else if (entrySha !== sha512)
    problems.push('the sha512 of the files entry is not the installer hash');
  if (entrySha !== null && entrySize === null) problems.push('the files entry has no size');
  else if (entrySize !== null && entrySize !== String(bytes.length)) {
    problems.push('the size is not the installer size');
  }
  if (topPath !== fileName) problems.push(`path is ${topPath ?? 'missing'}, expected ${fileName}`);
  if (topSha !== sha512) problems.push('the top level sha512 is not the installer hash');
  return problems;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  const [installer, update] = check ? args.slice(1) : args;
  if (installer === undefined || update === undefined) {
    throw new Error('usage: refresh-update-info.mts [--check] <signed installer> <latest.yml>');
  }
  const bytes = await readFile(installer);
  const yml = await readFile(update, 'utf8');
  if (check) {
    const problems = checkUpdateInfo(yml, basename(installer), bytes);
    if (problems.length > 0)
      throw new Error(`${basename(update)} is wrong: ${problems.join('; ')}.`);
    console.log(`${basename(update)} matches ${basename(installer)}.`);
    return;
  }
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const size = (await stat(installer)).size;
  await writeFile(update, refreshUpdateInfo(yml, basename(installer), sha512, size));
  console.log(`Updated ${basename(update)} for ${basename(installer)} (${String(size)} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'failed');
    process.exitCode = 1;
  });
}
