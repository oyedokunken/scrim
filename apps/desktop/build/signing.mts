/**
 * Decides how the Windows build is signed, from the environment alone. Pure on purpose: the build
 * config, the release workflow and the tests all call the same function, so "signing is on" means
 * one thing everywhere.
 *
 * Modes:
 * - none: no signing material. The installer is built unsigned and the job says so.
 * - pfx: a certificate file (WIN_CSC_LINK or CSC_LINK) with its password. electron-builder signs
 *   the app, the bundled FFmpeg, the native module and the installer.
 * - azure: Azure Artifact Signing (formerly Trusted Signing) through electron-builder.
 * - signpath: SignPath signs the finished installer in a later workflow step.
 */
type SigningMode = 'none' | 'pfx' | 'azure' | 'signpath';

export interface SigningDecision {
  readonly mode: SigningMode;
  /** True when the release must fail if the signature is missing or invalid. */
  readonly enabled: boolean;
  /** A line for the job summary that says what happens and why. */
  readonly message: string;
}

export type SigningEnv = Readonly<Record<string, string | undefined>>;

/** The repository allowed to sign. Forks and pull requests never get signing. */
const SIGNING_REPOSITORY = 'oyedokunken/scrim';

/**
 * Only the Windows prebuilds can be signed. The package also ships macOS and Linux builds, and
 * signtool fails on them. Matched by file name ending, with the Windows path separator, because
 * signing runs on Windows.
 */
const WINDOWS_NATIVE_MODULES = ['win32-x64\\uiohook-napi.node', 'win32-arm64\\uiohook-napi.node'];

/** An RFC 3161 timestamp keeps a signature valid after the certificate expires. */
const TIMESTAMP_URL = 'http://timestamp.digicert.com';

const filled = (env: SigningEnv, name: string): boolean => (env[name] ?? '').trim() !== '';
const allFilled = (env: SigningEnv, names: readonly string[]): boolean =>
  names.every((name) => filled(env, name));

const AZURE_NAMES = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_SIGNING_ENDPOINT',
  'AZURE_SIGNING_ACCOUNT',
  'AZURE_SIGNING_PROFILE',
  'WIN_PUBLISHER_NAME',
] as const;

const SIGNPATH_NAMES = [
  'SIGNPATH_API_TOKEN',
  'SIGNPATH_ORGANIZATION_ID',
  'SIGNPATH_PROJECT_SLUG',
  'SIGNPATH_SIGNING_POLICY_SLUG',
] as const;

/** A signing run is allowed only for a tag pushed in the main repository. */
function isTrustedRelease(env: SigningEnv): boolean {
  return (
    env['GITHUB_REPOSITORY'] === SIGNING_REPOSITORY &&
    env['GITHUB_EVENT_NAME'] === 'push' &&
    (env['GITHUB_REF'] ?? '').startsWith('refs/tags/v')
  );
}

export function decideSigning(env: SigningEnv): SigningDecision {
  // Outside CI there is no GITHUB_REPOSITORY. A developer who sets the secrets locally is
  // signing on purpose, so only a CI run that is NOT a trusted release is refused.
  const inCi = filled(env, 'GITHUB_ACTIONS');
  if (inCi && !isTrustedRelease(env)) {
    return {
      mode: 'none',
      enabled: false,
      message: 'Signing is skipped: this is not a tag build in the main repository.',
    };
  }
  if (allFilled(env, ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'WIN_PUBLISHER_NAME'])) {
    return { mode: 'pfx', enabled: true, message: 'Signing with the certificate file.' };
  }
  if (allFilled(env, AZURE_NAMES)) {
    return { mode: 'azure', enabled: true, message: 'Signing with Azure Artifact Signing.' };
  }
  if (allFilled(env, SIGNPATH_NAMES)) {
    return { mode: 'signpath', enabled: true, message: 'Signing the installer with SignPath.' };
  }
  return {
    mode: 'none',
    enabled: false,
    message:
      'WARNING: no signing secrets are set, so the Windows installer is UNSIGNED. ' +
      'SmartScreen will warn and automatic updates cannot be verified. See docs/code-signing.md.',
  };
}

/** The shape electron-builder reads for the Windows target. */
export interface WindowsSigningConfig {
  readonly verifyUpdateCodeSignature: boolean;
  readonly signExecutable?: boolean;
  readonly signExts?: string[];
  readonly signtoolOptions?: {
    readonly signingHashAlgorithms: ['sha256'];
    readonly rfc3161TimeStampServer: string;
    readonly publisherName: string;
  };
  readonly azureSignOptions?: {
    readonly publisherName: string;
    readonly endpoint: string;
    readonly codeSigningAccountName: string;
    readonly certificateProfileName: string;
    readonly timestampRfc3161: string;
    readonly timestampDigest: 'SHA256';
    readonly fileDigest: 'SHA256';
  };
}

/**
 * The electron-builder part of the decision. Only built-in signing (pfx and azure) edits the
 * config. SignPath signs the finished installer, so electron-builder is told not to sign.
 *
 * The Windows builds of the native mouse hook are added so they are signed. FFmpeg is an .exe, which is signed
 * by default, including files copied as extra resources.
 */
export function windowsSigningConfig(env: SigningEnv): WindowsSigningConfig {
  const decision = decideSigning(env);
  const publisherName = (env['WIN_PUBLISHER_NAME'] ?? '').trim();
  switch (decision.mode) {
    case 'pfx':
      return {
        verifyUpdateCodeSignature: true,
        signExts: WINDOWS_NATIVE_MODULES,
        signtoolOptions: {
          signingHashAlgorithms: ['sha256'],
          rfc3161TimeStampServer: TIMESTAMP_URL,
          publisherName,
        },
      };
    case 'azure':
      return {
        verifyUpdateCodeSignature: true,
        signExts: WINDOWS_NATIVE_MODULES,
        azureSignOptions: {
          publisherName,
          endpoint: env['AZURE_SIGNING_ENDPOINT'] ?? '',
          codeSigningAccountName: env['AZURE_SIGNING_ACCOUNT'] ?? '',
          certificateProfileName: env['AZURE_SIGNING_PROFILE'] ?? '',
          timestampRfc3161: 'http://timestamp.acs.microsoft.com',
          timestampDigest: 'SHA256',
          fileDigest: 'SHA256',
        },
      };
    case 'signpath':
      // The signed installer's publisher is the SignPath Foundation. WIN_PUBLISHER_NAME holds the
      // exact certificate subject name for the updater to check. Builder itself does not sign.
      return publisherName === ''
        ? { verifyUpdateCodeSignature: false, signExecutable: false }
        : {
            verifyUpdateCodeSignature: true,
            signExecutable: false,
            signtoolOptions: {
              signingHashAlgorithms: ['sha256'],
              rfc3161TimeStampServer: TIMESTAMP_URL,
              publisherName,
            },
          };
    default:
      // Unsigned: an installer without a signature cannot pass an updater signature check.
      return { verifyUpdateCodeSignature: false, signExecutable: false };
  }
}
