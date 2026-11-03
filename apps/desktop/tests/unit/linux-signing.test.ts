import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PUBLIC_KEY_FILE,
  decideLinuxSigning,
  isSignable,
  planLinuxSigning,
  publicKeyState,
  readPublicKey,
  signArguments,
  signFiles,
  type GpgResult,
  type LinuxSigningPlanInput,
  type RunGpg,
} from '../../build/linux-signing.mts';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cli = fileURLToPath(new URL('../../build/linux-signing-cli.mts', import.meta.url));
const workflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

const KEY_BLOCK =
  '-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nabc\n-----END PGP PUBLIC KEY BLOCK-----\n';

const ready: LinuxSigningPlanInput = {
  required: false,
  dryRun: false,
  inCi: true,
  trusted: true,
  hasKey: true,
  hasPassphrase: true,
  publicKey: 'real',
};

const temporary: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'scrim-linux-signing-test-'));
  temporary.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the public key file', () => {
  it('reads an armoured block as real, a header comment as the placeholder, nothing as missing', () => {
    expect(publicKeyState(KEY_BLOCK)).toBe('real');
    expect(publicKeyState('# replace me\n')).toBe('placeholder');
    expect(
      publicKeyState('-----END PGP PUBLIC KEY BLOCK-----\n-----BEGIN PGP PUBLIC KEY BLOCK-----'),
    ).toBe('placeholder');
    expect(publicKeyState('  \n')).toBe('missing');
    expect(publicKeyState(undefined)).toBe('missing');
  });

  it('is a placeholder in the repository until the owner replaces it', () => {
    const text = readPublicKey(repoRoot);
    expect(text?.startsWith('# PLACEHOLDER')).toBe(true);
    expect(publicKeyState(text)).toBe('placeholder');
    expect(text).not.toContain('PRIVATE KEY');
  });
});

describe('planLinuxSigning', () => {
  it('signs when the key, the passphrase and the public key are all there', () => {
    const decision = planLinuxSigning(ready);
    expect(decision).toMatchObject({ enabled: true, failure: null, missing: [] });
  });

  it('says a dry run signs nothing', () => {
    const decision = planLinuxSigning({ ...ready, dryRun: true });
    expect(decision.enabled).toBe(true);
    expect(decision.message).toContain('dry run');
  });

  it.each([
    ['the key', { hasKey: false }, 'LINUX_SIGNING_KEY'],
    ['the passphrase', { hasPassphrase: false }, 'LINUX_SIGNING_PASSPHRASE'],
    ['the public key file', { publicKey: 'missing' as const }, PUBLIC_KEY_FILE],
    ['the real public key', { publicKey: 'placeholder' as const }, 'placeholder'],
  ])('fails when signing is required and %s is missing', (_name, change, text) => {
    const decision = planLinuxSigning({ ...ready, required: true, ...change });
    expect(decision.enabled).toBe(false);
    expect(decision.failure).toContain(text);
    expect(decision.failure).toContain('required');
  });

  it('warns, and does not fail, when signing is not required and something is missing', () => {
    const decision = planLinuxSigning({ ...ready, hasKey: false, publicKey: 'placeholder' });
    expect(decision.enabled).toBe(false);
    expect(decision.failure).toBeNull();
    expect(decision.message).toContain('UNSIGNED');
    expect(decision.missing).toHaveLength(2);
  });

  it('lists everything that is missing at once', () => {
    const decision = planLinuxSigning({
      ...ready,
      required: true,
      hasKey: false,
      hasPassphrase: false,
      publicKey: 'missing',
    });
    expect(decision.missing).toHaveLength(3);
  });

  it('never signs outside a tag build in the main repository, and fails if it is required', () => {
    const skipped = planLinuxSigning({ ...ready, trusted: false });
    expect(skipped).toMatchObject({ enabled: false, failure: null });
    const refused = planLinuxSigning({ ...ready, trusted: false, required: true });
    expect(refused.failure).toContain('not a tag build');
  });

  it('lets a developer machine sign on purpose', () => {
    expect(planLinuxSigning({ ...ready, inCi: false, trusted: false }).enabled).toBe(true);
  });
});

describe('decideLinuxSigning from the environment', () => {
  const tag = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'oyedokunken/scrim',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/tags/v1.2.0',
    LINUX_SIGNING_KEY: 'k',
    LINUX_SIGNING_PASSPHRASE: 'p',
  };

  it('signs a tag build in the main repository', () => {
    expect(decideLinuxSigning(tag, KEY_BLOCK).enabled).toBe(true);
  });

  it('does not sign a fork', () => {
    const decision = decideLinuxSigning({ ...tag, GITHUB_REPOSITORY: 'someone/scrim' }, KEY_BLOCK);
    expect(decision.enabled).toBe(false);
  });

  it('does not sign a branch push, and a required run fails there', () => {
    const env = { ...tag, GITHUB_REF: 'refs/heads/main', REQUIRE_LINUX_SIGNING: 'true' };
    expect(decideLinuxSigning(env, KEY_BLOCK).failure).toContain('not a tag build');
  });

  it('reads REQUIRE_LINUX_SIGNING case insensitively and the placeholder as missing', () => {
    const decision = decideLinuxSigning({ ...tag, REQUIRE_LINUX_SIGNING: 'TRUE' }, '# placeholder');
    expect(decision.required).toBe(true);
    expect(decision.failure).toContain('placeholder');
  });

  it('treats a blank secret as missing', () => {
    const decision = decideLinuxSigning({ ...tag, LINUX_SIGNING_KEY: '  ' }, KEY_BLOCK);
    expect(decision.missing[0]).toContain('LINUX_SIGNING_KEY');
  });

  it('allows a dry run started by hand in the main repository', () => {
    const env = {
      ...tag,
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      SCRIM_SIGNING_DRY_RUN: 'true',
    };
    expect(decideLinuxSigning(env, KEY_BLOCK)).toMatchObject({ enabled: true, dryRun: true });
  });
});

describe('which files are signed', () => {
  it('signs the AppImage, the deb and the checksums, and nothing else', () => {
    expect(isSignable('Scrim-1.2.0-linux-x86_64.AppImage')).toBe(true);
    expect(isSignable('Scrim-1.2.0-linux-amd64.deb')).toBe(true);
    expect(isSignable('SHA256SUMS.txt')).toBe(true);
    for (const name of [
      'latest-linux.yml',
      'Scrim-Setup-1.2.0.exe',
      'x.AppImage.asc',
      'a.blockmap',
    ]) {
      expect(isSignable(name)).toBe(false);
    }
  });

  it('asks gpg for a detached armoured signature with the loopback passphrase on stdin', () => {
    const args = signArguments('/r/a.deb');
    expect(args).toEqual(
      expect.arrayContaining(['--batch', '--pinentry-mode', 'loopback', '--passphrase-fd', '0']),
    );
    expect(args).toEqual(expect.arrayContaining(['--armor', '--detach-sign']));
    expect(args.join(' ')).toContain('--output /r/a.deb.asc /r/a.deb');
  });
});

describe('signFiles with a fake gpg', () => {
  const calls: { args: readonly string[]; home: string; input: string | undefined }[] = [];
  const ok: GpgResult = { status: 0, stderr: '' };
  const fake =
    (fail?: (args: readonly string[]) => boolean): RunGpg =>
    (args, options) => {
      calls.push({ args, home: options.home, input: options.input });
      return fail?.(args) === true ? { status: 2, stderr: 'bad signature' } : ok;
    };

  afterEach(() => {
    calls.length = 0;
  });

  it('imports the key, signs and verifies each file, and deletes both keyrings', () => {
    const root = scratch();
    const homes: string[] = [];
    const written = signFiles({
      files: ['/r/a.deb', '/r/b.AppImage'],
      privateKey: 'PRIVATE',
      passphrase: 'secret-phrase',
      publicKeyFile: '/r/key.asc',
      tempRoot: root,
      stopAgent: (home) => homes.push(home),
      run: fake(),
    });
    expect(written).toEqual(['/r/a.deb.asc', '/r/b.AppImage.asc']);
    expect(calls.map((call) => call.args[call.args.length - 1])).toEqual([
      expect.stringMatching(/private\.asc$/),
      '/r/key.asc',
      '/r/a.deb',
      '/r/a.deb',
      '/r/b.AppImage',
      '/r/b.AppImage',
    ]);
    expect(homes).toHaveLength(2);
    expect(readdirSync(root)).toEqual([]);
  });

  it('keeps the passphrase and the key off every command line', () => {
    const root = scratch();
    signFiles({
      files: ['/r/a.deb'],
      privateKey: 'PRIVATE-KEY-TEXT',
      passphrase: 'secret-phrase',
      publicKeyFile: '/r/key.asc',
      tempRoot: root,
      stopAgent: () => undefined,
      run: fake(),
    });
    for (const call of calls) {
      expect(call.args.join(' ')).not.toContain('secret-phrase');
      expect(call.args.join(' ')).not.toContain('PRIVATE-KEY-TEXT');
    }
    const signing = calls.find((call) => call.args.includes('--detach-sign'));
    expect(signing?.input).toBe('secret-phrase\n');
  });

  it('signs in one keyring and verifies in another that never held the private key', () => {
    const root = scratch();
    signFiles({
      files: ['/r/a.deb'],
      privateKey: 'k',
      passphrase: 'p',
      publicKeyFile: '/r/key.asc',
      tempRoot: root,
      stopAgent: () => undefined,
      run: fake(),
    });
    const signHome = calls[0]?.home;
    const verify = calls.find((call) => call.args.includes('--verify'));
    expect(verify?.home).not.toBe(signHome);
    expect(calls.find((call) => call.args.includes('/r/key.asc'))?.home).toBe(verify?.home);
  });

  it('fails with gpg own message, and still deletes the keyrings', () => {
    const root = scratch();
    expect(() =>
      signFiles({
        files: ['/r/a.deb'],
        privateKey: 'k',
        passphrase: 'p',
        publicKeyFile: '/r/key.asc',
        tempRoot: root,
        stopAgent: () => undefined,
        run: fake((args) => args.includes('--verify')),
      }),
    ).toThrow(/Verifying a\.deb against docs\/scrim-release-key\.asc failed.*bad signature/);
    expect(readdirSync(root)).toEqual([]);
  });
});

const haveGpg = spawnSync('gpg', ['--version']).status === 0;

/**
 * The only gpg on a Windows developer machine is the one from Git for Windows, which reads paths
 * as /c/Users/... and not as a drive letter path. The release runs on Linux, where this does nothing.
 */
const msys = (path: string): string => {
  if (process.platform !== 'win32') return path;
  const slashed = path.split(String.fromCharCode(92)).join('/');
  return slashed.replace(/^([A-Za-z]):/, (_m, drive: string) => '/' + drive.toLowerCase());
};
const realRun: RunGpg = (args, options) => {
  const result = spawnSync('gpg', args.map(msys), {
    encoding: 'utf8',
    input: options.input ?? '',
    env: { PATH: process.env['PATH'] ?? '', GNUPGHOME: msys(options.home), LC_ALL: 'C' },
  });
  return { status: result.status, stderr: result.stderr };
};

describe.skipIf(!haveGpg)(
  'signFiles with the real gpg and a throwaway key',
  { timeout: 60_000 },
  () => {
    /** Makes a key in its own keyring folder. It is never the owner's key. */
    function makeKey(passphrase: string): { privateKey: string; publicKey: string } {
      const home = scratch();
      const env = { PATH: process.env['PATH'] ?? '', GNUPGHOME: msys(home) };
      const params = `%echo test\nKey-Type: EDDSA\nKey-Curve: ed25519\nKey-Usage: sign\nName-Real: Scrim Test\nName-Email: test@example.invalid\nExpire-Date: 0\nPassphrase: ${passphrase}\n%commit\n`;
      spawnSync('gpg', ['--batch', '--pinentry-mode', 'loopback', '--gen-key'], {
        input: params,
        env,
      });
      const exported = (args: string[]): string =>
        spawnSync(
          'gpg',
          [
            '--batch',
            '--pinentry-mode',
            'loopback',
            '--passphrase',
            passphrase,
            '--armor',
            ...args,
          ],
          { env, encoding: 'utf8' },
        ).stdout;
      const result = {
        privateKey: exported(['--export-secret-keys']),
        publicKey: exported(['--export']),
      };
      spawnSync('gpgconf', ['--kill', 'gpg-agent'], { env });
      return result;
    }

    it('signs a file, verifies it against the public key, and leaves no keyring behind', () => {
      const { privateKey, publicKey } = makeKey('correct horse');
      const root = scratch();
      const files = join(root, 'files');
      mkdirSync(files);
      const target = join(files, 'SHA256SUMS.txt');
      writeFileSync(target, 'abc  file\n');
      const publicKeyFile = join(root, 'key.asc');
      writeFileSync(publicKeyFile, publicKey);

      const written = signFiles({
        run: realRun,
        files: [target],
        privateKey,
        passphrase: 'correct horse',
        publicKeyFile,
      });
      expect(written).toEqual([`${target}.asc`]);
      expect(readFileSync(`${target}.asc`, 'utf8')).toContain('BEGIN PGP SIGNATURE');
      expect(readdirSync(tmpdir()).filter((name) => name.startsWith('scrim-gpg-'))).toEqual([]);
    });

    it('fails when the public key file is not the pair of the signing key', () => {
      const signer = makeKey('one');
      const other = makeKey('two');
      const root = scratch();
      const target = join(root, 'a.deb');
      writeFileSync(target, 'deb');
      const publicKeyFile = join(root, 'key.asc');
      writeFileSync(publicKeyFile, other.publicKey);
      expect(() =>
        signFiles({
          run: realRun,
          files: [target],
          privateKey: signer.privateKey,
          passphrase: 'one',
          publicKeyFile,
        }),
      ).toThrow(/Verifying a\.deb/);
      expect(existsSync(`${target}.asc`)).toBe(true);
    });

    it('fails on a wrong passphrase', () => {
      const { privateKey, publicKey } = makeKey('right');
      const root = scratch();
      const target = join(root, 'a.deb');
      writeFileSync(target, 'deb');
      const publicKeyFile = join(root, 'key.asc');
      writeFileSync(publicKeyFile, publicKey);
      expect(() =>
        signFiles({
          run: realRun,
          files: [target],
          privateKey,
          passphrase: 'wrong',
          publicKeyFile,
        }),
      ).toThrow(/Signing a\.deb failed/);
    });
  },
);

describe('the command line', () => {
  function run(env: Record<string, string>, ...args: string[]) {
    return spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', ...env },
    });
  }

  it('warns and succeeds when signing is not required and the key is a placeholder', () => {
    const result = run({}, 'decide');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNSIGNED');
  });

  it('fails when signing is required and the placeholder key is still in place', () => {
    const result = run(
      { REQUIRE_LINUX_SIGNING: 'true', LINUX_SIGNING_KEY: 'k', LINUX_SIGNING_PASSPHRASE: 'p' },
      'decide',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('placeholder');
  });

  it('refuses to sign when required and secrets are missing, and writes nothing', () => {
    const folder = scratch();
    writeFileSync(join(folder, 'a.deb'), 'x');
    const result = run({ REQUIRE_LINUX_SIGNING: 'true' }, 'sign', folder);
    expect(result.status).toBe(1);
    expect(readdirSync(folder)).toEqual(['a.deb']);
  });

  it('exits 2 without a folder', () => {
    expect(run({}, 'sign').status).toBe(2);
    expect(run({}, 'nonsense').status).toBe(2);
  });
});

describe('the release workflow, as text', () => {
  const linuxJob = workflow.slice(workflow.indexOf('\n  linux:'), workflow.indexOf('\n  publish:'));
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

  it('reads the secrets and the require variable', () => {
    for (const name of ['LINUX_SIGNING_KEY', 'LINUX_SIGNING_PASSPHRASE']) {
      expect(workflow).toContain(`secrets.${name}`);
    }
    expect(workflow).toContain('vars.REQUIRE_LINUX_SIGNING');
  });

  it('reads the fuses back from the Linux binary', () => {
    expect(linuxJob).toContain('pnpm verify:fuses release/linux-unpacked/scrim');
  });

  it('signs the AppImage and the deb before the upload, and uploads the signatures', () => {
    const decide = linuxJob.indexOf('linux-signing-cli.mts decide');
    const sign = linuxJob.indexOf('linux-signing-cli.mts sign release');
    const upload = linuxJob.indexOf('upload-artifact');
    expect(decide).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(decide);
    expect(upload).toBeGreaterThan(sign);
    expect(linuxJob).toContain('apps/desktop/release/*.asc');
  });

  it('signs the checksums after they are written, then verifies with the committed key', () => {
    const sums = publishJob.indexOf('sha256sum -- * > SHA256SUMS.txt');
    const sign = publishJob.indexOf('sign --only=SHA256SUMS.txt dist');
    const verify = publishJob.indexOf('gpg --batch --verify');
    const release = publishJob.indexOf('gh release create');
    expect(sums).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(sums);
    expect(verify).toBeGreaterThan(sign);
    expect(release).toBeGreaterThan(verify);
    expect(publishJob).toContain('source/docs/scrim-release-key.asc');
  });

  it('refuses unsigned Linux files when signing is required, in both jobs', () => {
    expect(linuxJob).toContain("if: vars.REQUIRE_LINUX_SIGNING == 'true'");
    expect(publishJob).toContain("if: vars.REQUIRE_LINUX_SIGNING == 'true'");
  });

  it('checks that latest-linux.yml names a file in the release', () => {
    expect(publishJob).toContain('latest-linux.yml names');
  });

  it('keeps the manual dispatch and the tag behaviour', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(linuxJob).toContain("if: github.event_name == 'push'");
    expect(publishJob).toContain("if: github.event_name == 'push'");
  });

  it('never puts a secret on a command line', () => {
    expect(workflow).not.toMatch(/--passphrase[ =]/);
  });
});
