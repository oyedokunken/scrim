import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The two Mac builds (arm64 and Intel) each write a `latest-mac.yml`, and they run on different
 * machines, so the two files would overwrite each other on the release. This joins them into one
 * file that lists the files of both. The updater then picks the one for its own architecture.
 *
 * The files are small and have a fixed shape written by electron-builder:
 *
 *   version: 1.2.0
 *   files:
 *     - url: Scrim-1.2.0-mac-arm64.zip
 *       sha512: ...
 *       size: 123
 *   path: Scrim-1.2.0-mac-arm64.zip
 *   sha512: ...
 *   releaseDate: '2026-10-30T10:00:00.000Z'
 *
 * so they are read as text, and nothing here needs a YAML library.
 */

interface Parsed {
  version: string;
  /** Each entry of `files`, as its own lines. */
  entries: string[][];
  path: string;
  sha512: string;
  releaseDate: string;
}

function parse(text: string): Parsed {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const top = (key: string): string => {
    const line = lines.find((entry) => entry.startsWith(`${key}: `));
    if (line === undefined) throw new Error(`The update file has no "${key}" line.`);
    return line.slice(key.length + 2).trim();
  };
  const start = lines.indexOf('files:');
  if (start < 0) throw new Error('The update file has no "files" list.');
  const entries: string[][] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('  - ')) entries.push([line]);
    else if (line.startsWith('    ') && entries.length > 0) entries[entries.length - 1]?.push(line);
    else break;
  }
  if (entries.length === 0) throw new Error('The "files" list is empty.');
  return {
    version: top('version'),
    entries,
    path: top('path'),
    sha512: top('sha512'),
    releaseDate: top('releaseDate'),
  };
}

/** Joins update files of one version into one. The first file supplies the legacy path and checksum. */
export function mergeMacUpdateInfo(texts: readonly string[]): string {
  const parsed = texts.map(parse);
  const first = parsed[0];
  if (first === undefined) throw new Error('There is nothing to merge.');
  for (const other of parsed) {
    if (other.version !== first.version) {
      throw new Error(
        `The Mac builds disagree on the version: ${first.version} and ${other.version}.`,
      );
    }
  }
  const seen = new Set<string>();
  const entries = parsed
    .flatMap((file) => file.entries)
    .filter((entry) => {
      const key = entry[0] ?? '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const releaseDate =
    parsed.map((file) => file.releaseDate).sort()[parsed.length - 1] ?? first.releaseDate;
  return [
    `version: ${first.version}`,
    'files:',
    ...entries.flat(),
    `path: ${first.path}`,
    `sha512: ${first.sha512}`,
    `releaseDate: ${releaseDate}`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const [output, ...inputs] = process.argv.slice(2);
  if (output === undefined || inputs.length === 0) {
    throw new Error('Usage: merge-mac-update-info.mts <output> <input> [<input> ...]');
  }
  const texts = await Promise.all(inputs.map((input) => readFile(input, 'utf8')));
  await writeFile(output, mergeMacUpdateInfo(texts));
  await Promise.all(inputs.map((input) => rm(input)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
