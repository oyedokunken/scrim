import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signing the installer after electron-builder wrote `latest.yml` changes the file, so the sha512 and
 * the size in that update file no longer match it, and every update would be refused as a checksum
 * error. This writes the real values for the signed file into the update file.
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
export function refreshUpdateInfo(yml: string, fileName: string, sha512: string, size: number): string {
  const lines = yml.split('\n');
  let inEntry = false;
  let topLevelMatches = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const url = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line);
    if (url !== null) inEntry = url[1] === fileName;
    else if (/^\S/.test(line)) inEntry = false;
    if (inEntry && /^\s+sha512:/.test(line)) lines[i] = line.replace(/sha512:.*/, `sha512: ${sha512}`);
    else if (inEntry && /^\s+size:/.test(line)) lines[i] = line.replace(/size:.*/, `size: ${String(size)}`);
    const path = /^path:\s*(.+?)\s*$/.exec(line);
    if (path !== null) topLevelMatches = path[1] === fileName;
    if (topLevelMatches && /^sha512:/.test(line)) lines[i] = `sha512: ${sha512}`;
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const [installer, update] = process.argv.slice(2);
  if (installer === undefined || update === undefined) {
    throw new Error('usage: refresh-update-info.mts <signed installer> <latest.yml>');
  }
  const bytes = await readFile(installer);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const size = (await stat(installer)).size;
  const yml = await readFile(update, 'utf8');
  await writeFile(update, refreshUpdateInfo(yml, basename(installer), sha512, size));
  console.log(`Updated ${basename(update)} for ${basename(installer)} (${String(size)} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'failed');
    process.exitCode = 1;
  });
}
