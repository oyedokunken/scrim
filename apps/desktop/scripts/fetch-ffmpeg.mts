import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  FFMPEG_BINARIES,
  FFMPEG_BUILD_PAGE,
  FFMPEG_PIN,
  FFMPEG_SOURCE_URL,
  FFMPEG_URL,
} from './ffmpeg-pin.mts';

// Fetches the pinned FFmpeg build into apps/desktop/resources/ffmpeg, which the installer copies
// into the app. Run it with `pnpm --filter @scrim/desktop fetch:ffmpeg`, and before packaging. It
// downloads once, checks the SHA-256 against the pin, and does nothing when the folder already
// holds that build. The binaries are never committed.

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../resources/ffmpeg');
const cacheDir = join(tmpdir(), 'scrim-ffmpeg-cache');
const stampFile = join(outDir, 'PINNED_BUILD.txt');
// Windows' own bsdtar, which reads zip files. Another tar earlier on the PATH, such as the one that
// comes with Git Bash, would read `C:` in a path as a remote host and fail.
const TAR = join(process.env['SystemRoot'] ?? String.raw`C:\Windows`, 'System32', 'tar.exe');

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function alreadyInstalled(): Promise<boolean> {
  if (!existsSync(stampFile)) return false;
  if (!(await readFile(stampFile, 'utf8')).includes(FFMPEG_PIN.sha256)) return false;
  return FFMPEG_BINARIES.every((name) => existsSync(join(outDir, name)));
}

async function download(target: string): Promise<void> {
  console.log(`Downloading ${FFMPEG_URL}`);
  const response = await fetch(FFMPEG_URL, { redirect: 'follow' });
  if (!response.ok || response.body === null) {
    throw new Error(`The download failed with status ${String(response.status)}.`);
  }
  const partial = `${target}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await rename(partial, target);
}

async function ensureArchive(): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const archive = join(cacheDir, FFMPEG_PIN.file);
  if (existsSync(archive) && (await sha256Of(archive)) === FFMPEG_PIN.sha256) return archive;
  await rm(archive, { force: true });
  await download(archive);
  const actual = await sha256Of(archive);
  if (actual !== FFMPEG_PIN.sha256) {
    await rm(archive, { force: true });
    throw new Error(
      `The download does not match the pinned hash.\n  expected ${FFMPEG_PIN.sha256}\n  got      ${actual}`,
    );
  }
  return archive;
}

function extract(archive: string, into: string): void {
  // Windows ships bsdtar, which reads zip files. Only the files the app needs are pulled out.
  const members = [...FFMPEG_BINARIES.map((name) => `*/bin/${name}`), '*/LICENSE.txt'];
  const result = spawnSync(TAR, ['-xf', archive, '-C', into, ...members], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Could not unpack the archive with Windows tar.');
}

async function findFile(root: string, relative: string): Promise<string> {
  const top = spawnSync(TAR, ['-tf', join(cacheDir, FFMPEG_PIN.file)], { encoding: 'utf8' });
  const entry = top.stdout.split(/\r?\n/).find((line) => line.endsWith(`/${relative}`));
  if (entry === undefined) throw new Error(`${relative} is not in the archive.`);
  return join(root, ...entry.split('/'));
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    console.log('The bundled FFmpeg is for the Windows build. Nothing to fetch on this system.');
    return;
  }
  if (await alreadyInstalled()) {
    console.log('FFmpeg is already in resources/ffmpeg and matches the pin.');
    return;
  }

  const archive = await ensureArchive();
  const work = await mkdtemp(join(tmpdir(), 'scrim-ffmpeg-'));
  try {
    extract(archive, work);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    for (const name of FFMPEG_BINARIES) {
      await copyFile(await findFile(work, `bin/${name}`), join(outDir, name));
    }
    await copyFile(await findFile(work, 'LICENSE.txt'), join(outDir, 'LICENSE.txt'));
    await writeFile(
      join(outDir, 'SOURCE.txt'),
      [
        'Scrim ships an unmodified FFmpeg build, licensed under the LGPL.',
        '',
        `Build:   ${FFMPEG_BUILD_PAGE}`,
        `Archive: ${FFMPEG_PIN.file}`,
        `SHA-256: ${FFMPEG_PIN.sha256}`,
        `Source:  ${FFMPEG_SOURCE_URL}`,
        '',
        'The full license text is in LICENSE.txt. The build is linked statically and contains no',
        'GPL licensed code. You can replace ffmpeg.exe and ffprobe.exe with your own build.',
        '',
      ].join('\n'),
    );
    await writeFile(stampFile, `${FFMPEG_PIN.tag}\n${FFMPEG_PIN.file}\n${FFMPEG_PIN.sha256}\n`);
    const size = (await stat(join(outDir, 'ffmpeg.exe'))).size;
    console.log(`FFmpeg is in resources/ffmpeg (ffmpeg.exe ${String(Math.round(size / 1e6))} MB).`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
