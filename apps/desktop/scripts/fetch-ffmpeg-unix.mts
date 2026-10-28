import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  FFMPEG_UNIX_BINARIES,
  ffmpegSourceFor,
  releaseTargetFor,
  type ReleaseTarget,
} from './ffmpeg-targets.mts';

// The macOS and Linux half of fetch-ffmpeg.mts. Linux x64 downloads the pinned LGPL build and
// checks its SHA-256. macOS has no prebuilt pin: build-ffmpeg-mac.sh builds the pinned source
// tarball into the same folder, and this script then only verifies that the result is there.

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(tmpdir(), 'scrim-ffmpeg-cache');
const TAR =
  process.platform === 'win32'
    ? join(process.env['SystemRoot'] ?? String.raw`C:\Windows`, 'System32', 'tar.exe')
    : 'tar';

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function findBin(root: string, name: string): Promise<string | undefined> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const inner = await findBin(path, name);
      if (inner !== undefined) return inner;
    } else if (entry.name === name && dirname(path).endsWith('bin')) {
      return path;
    }
  }
  return undefined;
}

async function installedAlready(outDir: string, sha256: string): Promise<boolean> {
  const stamp = join(outDir, 'PINNED_BUILD.txt');
  if (!existsSync(stamp)) return false;
  if (!(await readFile(stamp, 'utf8')).includes(sha256)) return false;
  return FFMPEG_UNIX_BINARIES.every((name) => existsSync(join(outDir, name)));
}

export async function fetchFfmpegUnix(target: ReleaseTarget, outDir: string): Promise<void> {
  const source = ffmpegSourceFor(target);
  if (source.kind === 'build-from-source') {
    if (FFMPEG_UNIX_BINARIES.every((name) => existsSync(join(outDir, name)))) {
      console.log('FFmpeg is already in the output folder (built from the pinned source).');
      return;
    }
    throw new Error(
      `There is no prebuilt LGPL FFmpeg for ${target}. Run ${source.script} on a Mac first. ` +
        `It builds the pinned source (${source.sourceUrl}, SHA-256 ${source.sha256}) into resources/ffmpeg.`,
    );
  }
  if (await installedAlready(outDir, source.sha256)) {
    console.log('FFmpeg is already in the output folder and matches the pin.');
    return;
  }

  await mkdir(cacheDir, { recursive: true });
  const archive = join(cacheDir, source.file);
  if (!existsSync(archive) || (await sha256Of(archive)) !== source.sha256) {
    await rm(archive, { force: true });
    console.log(`Downloading ${source.url}`);
    const response = await fetch(source.url, { redirect: 'follow' });
    if (!response.ok || response.body === null) {
      throw new Error(`The download failed with status ${String(response.status)}.`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(`${archive}.partial`));
    await rename(`${archive}.partial`, archive);
    const actual = await sha256Of(archive);
    if (actual !== source.sha256) {
      await rm(archive, { force: true });
      throw new Error(
        `The download does not match the pinned hash.\n  expected ${source.sha256}\n  got      ${actual}`,
      );
    }
  }

  const work = await mkdtemp(join(tmpdir(), 'scrim-ffmpeg-'));
  try {
    const unpack = spawnSync(TAR, ['-xf', archive, '-C', work], { stdio: 'inherit' });
    if (unpack.status !== 0) throw new Error('Could not unpack the archive with tar.');
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    for (const name of FFMPEG_UNIX_BINARIES) {
      const found = await findBin(work, name);
      if (found === undefined) throw new Error(`${name} is not in the archive.`);
      const to = join(outDir, name);
      await copyFile(found, to);
      await chmod(to, 0o755);
    }
    const license = join(work, source.file.replace(/\.tar\.xz$/, ''), 'LICENSE.txt');
    if (existsSync(license)) await copyFile(license, join(outDir, 'LICENSE.txt'));
    await writeFile(
      join(outDir, 'SOURCE.txt'),
      [
        'Scrim ships an unmodified FFmpeg build, licensed under the LGPL.',
        '',
        `Build:   ${source.buildPage}`,
        `Archive: ${source.file}`,
        `SHA-256: ${source.sha256}`,
        '',
        'The build is linked statically and contains no GPL licensed code. You can replace',
        'ffmpeg and ffprobe with your own build.',
        '',
      ].join('\n'),
    );
    await writeFile(join(outDir, 'PINNED_BUILD.txt'), `${source.file}\n${source.sha256}\n`);
    const size = (await stat(join(outDir, 'ffmpeg'))).size;
    console.log(`FFmpeg is in ${outDir} (ffmpeg ${String(Math.round(size / 1e6))} MB).`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** The target for this machine, or the one named with `--target`. */
export function pickTarget(argv: readonly string[]): ReleaseTarget | undefined {
  const index = argv.indexOf('--target');
  const named = index === -1 ? undefined : argv[index + 1];
  if (named === 'linux-x64' || named === 'darwin-x64' || named === 'darwin-arm64') return named;
  return releaseTargetFor(process.platform, process.arch);
}

export const defaultOutDir = join(here, '../resources/ffmpeg');
