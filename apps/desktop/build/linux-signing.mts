/**
 * Signs the Linux release files with the owner's GPG key. Linux has no central signing authority,
 * so people verify a download with the public key published in the repository
 * (docs/scrim-release-key.asc) and the two commands on the website.
 *
 * Files signed: each .AppImage and .deb, and SHA256SUMS.txt, every one with a detached ASCII
 * armoured signature next to it (<file>.asc). An embedded AppImage signature is not made: appimagetool
 * can embed one, but electron-builder does not pass it the key, so adding it would mean replacing
 * the builder's AppImage step. A signed deb (debsigs) needs a policy file on the user's machine, so
 * the detached signature is the one path that works for everyone.
 *
 * The decision is a pure function, like signing.mts for Windows, so the release workflow, the
 * command line and the tests all share one meaning of "Linux signing is on". REQUIRE_LINUX_SIGNING=true
 * turns every unsigned outcome into a failure, so an unsigned Linux release cannot publish.
 *
 * Secrets: LINUX_SIGNING_KEY (ASCII armoured private key) and LINUX_SIGNING_PASSPHRASE. The private
 * key is imported into a temporary keyring that is deleted afterwards. The passphrase goes to gpg
 * on standard input (loopback pinentry), never on a command line.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/** The public key people verify against. The owner replaces the placeholder with the real key. */
export const PUBLIC_KEY_FILE = 'docs/scrim-release-key.asc';

export type PublicKeyState = 'real' | 'placeholder' | 'missing';

export type SigningEnv = Readonly<Record<string, string | undefined>>;

const filled = (env: SigningEnv, name: string): boolean => (env[name] ?? '').trim() !== '';

/** A real key has an armoured public key block. A header comment alone is the placeholder. */
export function publicKeyState(text: string | undefined): PublicKeyState {
  if (text === undefined || text.trim() === '') return 'missing';
  const begin = text.indexOf('-----BEGIN PGP PUBLIC KEY BLOCK-----');
  const end = text.indexOf('-----END PGP PUBLIC KEY BLOCK-----');
  return begin !== -1 && end > begin ? 'real' : 'placeholder';
}

export interface LinuxSigningDecision {
  /** True when signing will run (or would, in a dry run), so the result must be verified. */
  readonly enabled: boolean;
  readonly required: boolean;
  readonly dryRun: boolean;
  /** Set when the release must stop. Null otherwise. */
  readonly failure: string | null;
  readonly message: string;
  /** What is missing, in plain words. Empty when signing is on. */
  readonly missing: readonly string[];
}

export interface LinuxSigningPlanInput {
  readonly required: boolean;
  readonly dryRun: boolean;
  readonly inCi: boolean;
  /** A tag build in the main repository, or a dry run started by hand there. */
  readonly trusted: boolean;
  readonly hasKey: boolean;
  readonly hasPassphrase: boolean;
  readonly publicKey: PublicKeyState;
}

const REPOSITORY = 'oyedokunken/scrim';

/** The whole decision, with no environment or file access. */
export function planLinuxSigning(input: LinuxSigningPlanInput): LinuxSigningDecision {
  const base = { required: input.required, dryRun: input.dryRun } as const;
  const fail = (failure: string, missing: readonly string[] = []): LinuxSigningDecision => ({
    ...base,
    enabled: false,
    failure,
    message: `FAILED: ${failure}`,
    missing,
  });
  if (input.inCi && !input.trusted) {
    return input.required
      ? fail('Linux signing is required, but this is not a tag build in the main repository.')
      : {
          ...base,
          enabled: false,
          failure: null,
          message: 'Linux signing is skipped: this is not a tag build in the main repository.',
          missing: [],
        };
  }
  const missing: string[] = [];
  if (!input.hasKey) missing.push('the LINUX_SIGNING_KEY secret');
  if (!input.hasPassphrase) missing.push('the LINUX_SIGNING_PASSPHRASE secret');
  if (input.publicKey === 'missing') missing.push(`the public key file ${PUBLIC_KEY_FILE}`);
  if (input.publicKey === 'placeholder') {
    missing.push(`the real public key in ${PUBLIC_KEY_FILE} (it is still the placeholder)`);
  }
  if (missing.length === 0) {
    const dry = input.dryRun ? ' (dry run: nothing is signed)' : '';
    return {
      ...base,
      enabled: true,
      failure: null,
      message: `Signing the AppImage, the deb and SHA256SUMS.txt with GPG${dry}.`,
      missing: [],
    };
  }
  if (input.required) {
    return fail(`Linux signing is required, but ${missing.join(' and ')} is missing.`, missing);
  }
  return {
    ...base,
    enabled: false,
    failure: null,
    message:
      `WARNING: ${missing.join(' and ')} is missing, so the Linux files are UNSIGNED. ` +
      'People cannot verify them. See docs/releasing.md.',
    missing,
  };
}

/** Reads the environment and the public key file into plain facts for planLinuxSigning. */
function linuxSigningInputFromEnv(
  env: SigningEnv,
  publicKeyText: string | undefined,
  dryRunFlag = false,
): LinuxSigningPlanInput {
  const dryRun = dryRunFlag || (env['SCRIM_SIGNING_DRY_RUN'] ?? '').trim().toLowerCase() === 'true';
  const tagPush =
    env['GITHUB_EVENT_NAME'] === 'push' && (env['GITHUB_REF'] ?? '').startsWith('refs/tags/v');
  const rehearsal = dryRun && env['GITHUB_EVENT_NAME'] === 'workflow_dispatch';
  return {
    required: (env['REQUIRE_LINUX_SIGNING'] ?? '').trim().toLowerCase() === 'true',
    dryRun,
    inCi: filled(env, 'GITHUB_ACTIONS'),
    trusted: env['GITHUB_REPOSITORY'] === REPOSITORY && (tagPush || rehearsal),
    hasKey: filled(env, 'LINUX_SIGNING_KEY'),
    hasPassphrase: filled(env, 'LINUX_SIGNING_PASSPHRASE'),
    publicKey: publicKeyState(publicKeyText),
  };
}

export function decideLinuxSigning(
  env: SigningEnv,
  publicKeyText: string | undefined,
  dryRunFlag = false,
): LinuxSigningDecision {
  return planLinuxSigning(linuxSigningInputFromEnv(env, publicKeyText, dryRunFlag));
}

/** Which files of a release folder get a signature. */
export function isSignable(name: string): boolean {
  return /\.(appimage|deb)$/i.test(name) || name === 'SHA256SUMS.txt';
}

export interface GpgResult {
  readonly status: number | null;
  readonly stderr: string;
}

export type RunGpg = (
  args: readonly string[],
  options: { readonly home: string; readonly input?: string },
) => GpgResult;

/** Runs the real gpg with its own keyring folder. */
const runGpg: RunGpg = (args, options) => {
  const result = spawnSync('gpg', [...args], {
    encoding: 'utf8',
    input: options.input ?? '',
    env: { PATH: process.env['PATH'] ?? '', GNUPGHOME: options.home, LC_ALL: 'C' },
  });
  return { status: result.status, stderr: result.stderr };
};

/** The gpg arguments that sign one file non-interactively with a detached armoured signature. */
export function signArguments(file: string): string[] {
  return [
    '--batch',
    '--yes',
    '--pinentry-mode',
    'loopback',
    '--passphrase-fd',
    '0',
    '--armor',
    '--detach-sign',
    '--output',
    `${file}.asc`,
    file,
  ];
}

export interface SignInput {
  readonly files: readonly string[];
  readonly privateKey: string;
  readonly passphrase: string;
  /** The committed public key file the signatures are checked against. */
  readonly publicKeyFile: string;
  readonly run?: RunGpg;
  /** Stops the gpg agent of a keyring folder. Defaults to `gpgconf --kill gpg-agent`. */
  readonly stopAgent?: (home: string) => void;
  /** Where the temporary keyrings go. Defaults to the system temporary folder. */
  readonly tempRoot?: string;
}

function stopGpgAgent(home: string): void {
  spawnSync('gpgconf', ['--kill', 'gpg-agent'], {
    env: { PATH: process.env['PATH'] ?? '', GNUPGHOME: home },
    stdio: 'ignore',
  });
}

/**
 * Imports the private key into a temporary keyring, signs every file, then checks each signature
 * against the committed public key in a second, empty keyring. That check fails when the secret
 * and the public key file are not a pair. Both keyrings are deleted, also on failure, after the
 * gpg agent that holds the key is told to stop. Returns the signature files it wrote.
 */
export function signFiles(input: SignInput): string[] {
  const run = input.run ?? runGpg;
  const stop = input.stopAgent ?? stopGpgAgent;
  const root = input.tempRoot ?? tmpdir();
  const signingHome = mkdtempSync(join(root, 'scrim-gpg-sign-'));
  const verifyHome = mkdtempSync(join(root, 'scrim-gpg-verify-'));
  const need = (result: GpgResult, what: string): void => {
    if (result.status !== 0) {
      throw new Error(
        `${what} failed (gpg exit ${String(result.status)}): ${result.stderr.trim()}`,
      );
    }
  };
  try {
    const keyFile = join(signingHome, 'private.asc');
    writeFileSync(keyFile, input.privateKey, { mode: 0o600 });
    need(run(['--batch', '--import', keyFile], { home: signingHome }), 'Importing the signing key');
    rmSync(keyFile, { force: true });
    need(
      run(['--batch', '--import', input.publicKeyFile], { home: verifyHome }),
      `Importing ${PUBLIC_KEY_FILE}`,
    );
    const written: string[] = [];
    for (const file of input.files) {
      need(
        run(signArguments(file), {
          home: signingHome,
          input: `${input.passphrase}
`,
        }),
        `Signing ${basename(file)}`,
      );
      need(
        run(['--batch', '--verify', `${file}.asc`, file], { home: verifyHome }),
        `Verifying ${basename(file)} against ${PUBLIC_KEY_FILE}`,
      );
      written.push(`${file}.asc`);
    }
    return written;
  } finally {
    stop(signingHome);
    stop(verifyHome);
    rmSync(signingHome, { recursive: true, force: true });
    rmSync(verifyHome, { recursive: true, force: true });
  }
}

export function readPublicKey(root: string): string | undefined {
  const path = join(root, PUBLIC_KEY_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}
