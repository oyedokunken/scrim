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
 * - signpath: SignPath signs the app's programs, then the finished installer, in workflow steps.
 *
 * REQUIRE_WINDOWS_SIGNING=true turns every "unsigned" outcome into a failure, so a release cannot
 * publish an unsigned installer.
 */
type SigningMode = 'none' | 'pfx' | 'azure' | 'signpath';

export interface SigningDecision {
  readonly mode: SigningMode;
  /** True when a signing provider is configured and will run, so the signature must be verified. */
  readonly enabled: boolean;
  /** True when the repository variable REQUIRE_WINDOWS_SIGNING is "true". */
  readonly required: boolean;
  /** True for a rehearsal: every step runs except the call to the signing service. */
  readonly dryRun: boolean;
  /** Set when the release must stop: signing is required and cannot happen. Null otherwise. */
  readonly failure: string | null;
  /** A line for the job summary that says what happens and why. */
  readonly message: string;
}

export type SigningEnv = Readonly<Record<string, string | undefined>>;

/** The repository allowed to sign. Forks and pull requests never get signing. */
const SIGNING_REPOSITORY = 'oyedokunken/scrim';

/**
 * The publisher Windows shows for a SignPath Foundation certificate. It is a public name, not a
 * credential. WIN_PUBLISHER_NAME overrides it, for a certificate issued to someone else.
 */
export const SIGNPATH_PUBLISHER = 'SignPath Foundation';

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

/** Everything the decision depends on, already reduced to plain facts. */
export interface SigningPlanInput {
  /** REQUIRE_WINDOWS_SIGNING is "true". */
  readonly required: boolean;
  readonly dryRun: boolean;
  /** Running in GitHub Actions. A developer machine is not. */
  readonly inCi: boolean;
  /** A tag build in the main repository (or a dry run started by hand there). */
  readonly trusted: boolean;
  /** Which providers have every secret they need. */
  readonly available: {
    readonly pfx: boolean;
    readonly azure: boolean;
    readonly signpath: boolean;
  };
}

/**
 * The whole decision, with no environment access. When signing is required, every path that would
 * produce an unsigned installer returns a failure instead, so an unsigned release cannot publish.
 */
export function planSigning(input: SigningPlanInput): SigningDecision {
  const base = { required: input.required, dryRun: input.dryRun, failure: null } as const;
  const dry = input.dryRun ? ' (dry run: the signing service is not called)' : '';
  if (input.inCi && !input.trusted) {
    return input.required
      ? {
          ...base,
          mode: 'none',
          enabled: false,
          failure:
            'Windows signing is required, but this is not a tag build in the main repository.',
          message:
            'FAILED: Windows signing is required, but this is not a tag build in the main repository.',
        }
      : {
          ...base,
          mode: 'none',
          enabled: false,
          message: 'Signing is skipped: this is not a tag build in the main repository.',
        };
  }
  if (input.available.pfx) {
    return {
      ...base,
      mode: 'pfx',
      enabled: true,
      message: `Signing with the certificate file${dry}.`,
    };
  }
  if (input.available.azure) {
    return {
      ...base,
      mode: 'azure',
      enabled: true,
      message: `Signing with Azure Artifact Signing${dry}.`,
    };
  }
  if (input.available.signpath) {
    return {
      ...base,
      mode: 'signpath',
      enabled: true,
      message: `Signing the app and the installer with SignPath${dry}.`,
    };
  }
  if (input.required) {
    const failure =
      'Windows signing is required, but no signing secrets are set. See docs/code-signing.md.';
    return { ...base, mode: 'none', enabled: false, failure, message: `FAILED: ${failure}` };
  }
  return {
    ...base,
    mode: 'none',
    enabled: false,
    message:
      'WARNING: no signing secrets are set, so the Windows installer is UNSIGNED. ' +
      'SmartScreen will warn and automatic updates cannot be verified. See docs/code-signing.md.',
  };
}

/** Reads the environment into plain facts for planSigning. */
function signingInputFromEnv(env: SigningEnv, dryRunFlag = false): SigningPlanInput {
  const dryRun = dryRunFlag || (env['SCRIM_SIGNING_DRY_RUN'] ?? '').trim().toLowerCase() === 'true';
  const tagPush =
    env['GITHUB_EVENT_NAME'] === 'push' && (env['GITHUB_REF'] ?? '').startsWith('refs/tags/v');
  // A hand started rehearsal in the main repository counts as trusted, because a workflow_dispatch
  // run is never a tag push. It still never calls the signing service.
  const rehearsal = dryRun && env['GITHUB_EVENT_NAME'] === 'workflow_dispatch';
  return {
    required: (env['REQUIRE_WINDOWS_SIGNING'] ?? '').trim().toLowerCase() === 'true',
    dryRun,
    inCi: filled(env, 'GITHUB_ACTIONS'),
    trusted: env['GITHUB_REPOSITORY'] === SIGNING_REPOSITORY && (tagPush || rehearsal),
    available: {
      pfx: allFilled(env, ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'WIN_PUBLISHER_NAME']),
      azure: allFilled(env, AZURE_NAMES),
      signpath: allFilled(env, SIGNPATH_NAMES),
    },
  };
}

export function decideSigning(env: SigningEnv, dryRunFlag = false): SigningDecision {
  // Outside CI there is no GITHUB_REPOSITORY. A developer who sets the secrets locally is
  // signing on purpose, so only a CI run that is NOT a trusted release is refused.
  return planSigning(signingInputFromEnv(env, dryRunFlag));
}

/**
 * The publisher name of the signed program, or an empty string when the build is not signed. It
 * is what electron-updater checks on a downloaded update and what the About card shows.
 *
 * A dry run never signs, so it has no publisher either: the About card must not claim a
 * signature that does not exist.
 */
export function windowsPublisher(env: SigningEnv): string {
  const decision = decideSigning(env);
  if (!decision.enabled || decision.dryRun) return '';
  const named = (env['WIN_PUBLISHER_NAME'] ?? '').trim();
  if (named !== '') return named;
  return decision.mode === 'signpath' ? SIGNPATH_PUBLISHER : '';
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
 * config. SignPath signs outside the builder, so the builder is told not to sign.
 *
 * Effect of the publisher name on updates: electron-builder writes it into app-update.yml, and
 * electron-updater then refuses a downloaded installer whose signature is not from that
 * publisher. The first signed release after unsigned ones installs fine over an old unsigned
 * version, because that version has no publisher check. From then on, a signed version refuses
 * any unsigned update. An unsigned build has no publisher and no check.
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
      return {
        verifyUpdateCodeSignature: true,
        signExecutable: false,
        signtoolOptions: {
          signingHashAlgorithms: ['sha256'],
          rfc3161TimeStampServer: TIMESTAMP_URL,
          publisherName: publisherName === '' ? SIGNPATH_PUBLISHER : publisherName,
        },
      };
    default:
      // Unsigned: an installer without a signature cannot pass an updater signature check.
      return { verifyUpdateCodeSignature: false, signExecutable: false };
  }
}
