// Which files inside the unpacked Windows app are signed before the installer is built, and the
// small commands the release workflow uses to hand them to a signing service and put them back.
//
//   node build/signing-targets.mts list    <app dir>
//   node build/signing-targets.mts stage   <app dir> <out dir>
//   node build/signing-targets.mts restore <signed dir> <app dir> [--expect-changed]
//
// The installer is built after this, from the signed app, so the program inside the installer
// carries a signature too. The uninstaller is made by the installer builder itself and cannot be
// signed in a separate request, so it stays unsigned. See docs/code-signing.md.
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const slashed = (path: string): string => path.split('\\').join('/');

/**
 * Picks the programs users run out of a list of paths relative to the unpacked app: every .exe in
 * the app root (Scrim.exe), the bundled FFmpeg programs, and the Windows builds of the native
 * mouse hook. Electron's own libraries are already signed by their maker and are left alone.
 */
export function signingTargets(relativePaths: readonly string[]): string[] {
  return relativePaths
    .map(slashed)
    .filter(
      (path) =>
        /^[^/]+\.exe$/i.test(path) ||
        /^resources\/ffmpeg\/[^/]+\.exe$/i.test(path) ||
        /^resources\/app\.asar\.unpacked\/node_modules\/uiohook-napi\/prebuilds\/win32-[^/]+\/[^/]+\.node$/i.test(
          path,
        ),
    )
    .sort();
}

/** Returns what is missing from the list, so a wrong folder fails before anything is uploaded. */
export function missingTargets(targets: readonly string[]): string[] {
  const missing: string[] = [];
  if (!targets.some((path) => /^[^/]+\.exe$/i.test(path)))
    missing.push('the app program (Scrim.exe)');
  if (!targets.some((path) => /^resources\/ffmpeg\/ffmpeg\.exe$/i.test(path))) {
    missing.push('resources/ffmpeg/ffmpeg.exe');
  }
  return missing;
}

function walk(root: string, folder = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const relative = folder === '' ? entry.name : `${folder}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(root, relative));
    else found.push(relative);
  }
  return found;
}

/** The targets of an unpacked app folder. Throws when a required program is missing. */
export function targetsOf(appDir: string): string[] {
  const targets = signingTargets(walk(appDir));
  const missing = missingTargets(targets);
  if (missing.length > 0) {
    throw new Error(`${appDir} is not an unpacked Scrim app, missing ${missing.join(' and ')}.`);
  }
  return targets;
}

/** Copies the targets, with their folders, into a new folder that is then uploaded for signing. */
export function stageTargets(appDir: string, outDir: string): string[] {
  const targets = targetsOf(appDir);
  for (const target of targets) {
    const to = join(outDir, target);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(appDir, target), to);
  }
  return targets;
}

export interface RestoreOptions {
  /** Fail when a returned file is identical to the original, which means nothing was signed. */
  readonly expectChanged?: boolean;
}

/** Puts the signed files back over the originals. Every target must come back, none may be extra. */
export function restoreTargets(
  signedDir: string,
  appDir: string,
  options: RestoreOptions = {},
): string[] {
  const targets = targetsOf(appDir);
  const returned = signingTargets(walk(signedDir));
  const absent = targets.filter((target) => !returned.includes(target));
  if (absent.length > 0) throw new Error(`The signed set is missing: ${absent.join(', ')}.`);
  const extra = returned.filter((target) => !targets.includes(target));
  if (extra.length > 0)
    throw new Error(`The signed set has files that were not sent: ${extra.join(', ')}.`);
  if (options.expectChanged === true) {
    const same = targets.filter((target) =>
      readFileSync(join(appDir, target)).equals(readFileSync(join(signedDir, target))),
    );
    if (same.length > 0) throw new Error(`These files came back unsigned: ${same.join(', ')}.`);
  }
  for (const target of targets) copyFileSync(join(signedDir, target), join(appDir, target));
  return targets;
}

function main(argv: readonly string[]): void {
  const [command, first, second] = argv.filter((arg) => !arg.startsWith('--'));
  const expectChanged = argv.includes('--expect-changed');
  if (command === 'list' && first !== undefined) {
    for (const target of targetsOf(first)) console.log(resolve(first, target));
  } else if (command === 'stage' && first !== undefined && second !== undefined) {
    const staged = stageTargets(first, second);
    console.log(`Staged ${String(staged.length)} files for signing:\n${staged.join('\n')}`);
  } else if (command === 'restore' && first !== undefined && second !== undefined) {
    const restored = restoreTargets(first, second, { expectChanged });
    console.log(`Put back ${String(restored.length)} signed files.`);
  } else {
    throw new Error('usage: signing-targets.mts list|stage|restore ... (see the file header)');
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'failed');
    process.exitCode = 1;
  }
}
