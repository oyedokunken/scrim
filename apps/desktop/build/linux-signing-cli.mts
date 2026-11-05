// Run by the release workflow, with plain Node, from the repository root or anywhere else.
//   node apps/desktop/build/linux-signing-cli.mts decide [--dry-run]
//   node apps/desktop/build/linux-signing-cli.mts sign [--dry-run] [--only=<file name>] <folder>
// `decide` prints the signing decision, writes it to the job outputs and summary, and fails only
// when signing is required (REQUIRE_LINUX_SIGNING) and cannot happen. `sign` signs every AppImage,
// every deb and SHA256SUMS.txt in the folder, and verifies each signature against
// docs/scrim-release-key.asc. --only limits it to one file name. A dry run does everything except
// calling gpg.
import { appendFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLIC_KEY_FILE,
  decideLinuxSigning,
  isSignable,
  readPublicKey,
  signFiles,
} from './linux-signing.mts';

const argv = process.argv.slice(2);
const command = argv[0];
const dryFlag = argv.includes('--dry-run');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const env = process.env;

const decision = decideLinuxSigning(env, readPublicKey(repoRoot), dryFlag);
const inCi = (env['GITHUB_ACTIONS'] ?? '') !== '';
const note = (line: string): void => {
  console.log(inCi && !decision.enabled && decision.failure === null ? `::warning::${line}` : line);
};

if (command === 'decide') {
  const output = env['GITHUB_OUTPUT'];
  const summary = env['GITHUB_STEP_SUMMARY'];
  if (output) {
    appendFileSync(
      output,
      [
        `enabled=${String(decision.enabled)}`,
        `dry_run=${String(decision.dryRun)}`,
        `required=${String(decision.required)}`,
        '',
      ].join('\n'),
    );
  }
  if (summary) appendFileSync(summary, `### Linux signing\n\n${decision.message}\n`);
  if (decision.failure !== null) {
    console.error(inCi ? `::error::${decision.failure}` : decision.failure);
    process.exitCode = 1;
  } else {
    note(decision.message);
  }
} else if (command === 'sign') {
  const folder = argv.filter((arg) => !arg.startsWith('--'))[1];
  if (folder === undefined) {
    console.error('Usage: linux-signing-cli.mts sign [--dry-run] <folder>');
    process.exit(2);
  }
  if (decision.failure !== null) {
    console.error(inCi ? `::error::${decision.failure}` : decision.failure);
    process.exit(1);
  }
  const only = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const files = readdirSync(folder)
    .filter((name) => (only === undefined ? isSignable(name) : name === only))
    .map((name) => join(folder, name));
  if (!decision.enabled) {
    note(decision.message);
  } else if (decision.dryRun) {
    console.log(`Dry run: would sign ${files.length} file(s): ${files.join(', ')}`);
  } else {
    if (files.length === 0) {
      console.error(`No AppImage, deb or SHA256SUMS.txt in ${folder}, so nothing was signed.`);
      process.exit(1);
    }
    try {
      const written = signFiles({
        files,
        privateKey: env['LINUX_SIGNING_KEY'] ?? '',
        passphrase: env['LINUX_SIGNING_PASSPHRASE'] ?? '',
        publicKeyFile: join(repoRoot, PUBLIC_KEY_FILE),
      });
      console.log(`Signed and verified ${written.length} file(s).`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
} else {
  console.error('Usage: linux-signing-cli.mts decide|sign [--dry-run] [<folder>]');
  process.exit(2);
}
