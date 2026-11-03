import { describe, expect, it } from 'vitest';
import {
  decideSigning,
  planSigning,
  SIGNPATH_PUBLISHER,
  windowsPublisher,
  windowsSigningConfig,
  type SigningEnv,
} from '../../build/signing.mts';
import { evaluateSignature, parseSignatureJson } from '../../build/verify-signature.mts';

const release: SigningEnv = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'oyedokunken/scrim',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/tags/v1.0.0',
};
const pfx: SigningEnv = {
  WIN_CSC_LINK: 'x',
  WIN_CSC_KEY_PASSWORD: 'y',
  WIN_PUBLISHER_NAME: 'Example',
};
const azure: SigningEnv = {
  AZURE_TENANT_ID: 'a',
  AZURE_CLIENT_ID: 'b',
  AZURE_CLIENT_SECRET: 'c',
  AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net',
  AZURE_SIGNING_ACCOUNT: 'acct',
  AZURE_SIGNING_PROFILE: 'profile',
  WIN_PUBLISHER_NAME: 'Example',
};
const signpath: SigningEnv = {
  SIGNPATH_API_TOKEN: 't',
  SIGNPATH_ORGANIZATION_ID: 'o',
  SIGNPATH_PROJECT_SLUG: 'p',
  SIGNPATH_SIGNING_POLICY_SLUG: 's',
};

describe('decideSigning', () => {
  it('builds unsigned, with a warning, when no secret exists', () => {
    const decision = decideSigning(release);
    expect(decision).toMatchObject({ mode: 'none', enabled: false });
    expect(decision.message).toContain('UNSIGNED');
  });

  it('picks the provider whose secrets are all present', () => {
    expect(decideSigning({ ...release, ...pfx }).mode).toBe('pfx');
    expect(decideSigning({ ...release, ...azure }).mode).toBe('azure');
    expect(decideSigning({ ...release, ...signpath }).mode).toBe('signpath');
  });

  it('ignores a half set provider and empty values', () => {
    expect(decideSigning({ ...release, WIN_CSC_LINK: 'x' }).mode).toBe('none');
    expect(decideSigning({ ...release, ...pfx, WIN_CSC_KEY_PASSWORD: '  ' }).mode).toBe('none');
  });

  it('never signs for pull requests, forks or branch builds in CI', () => {
    const secrets = { ...pfx };
    expect(
      decideSigning({ ...release, ...secrets, GITHUB_EVENT_NAME: 'pull_request' }).enabled,
    ).toBe(false);
    expect(
      decideSigning({ ...release, ...secrets, GITHUB_REPOSITORY: 'someone/scrim' }).enabled,
    ).toBe(false);
    expect(decideSigning({ ...release, ...secrets, GITHUB_REF: 'refs/heads/main' }).enabled).toBe(
      false,
    );
  });

  it('allows a local run that sets the secrets on purpose', () => {
    expect(decideSigning(pfx).mode).toBe('pfx');
    expect(decideSigning({}).mode).toBe('none');
  });
});

describe('windowsSigningConfig', () => {
  it('signs with SHA-256, a timestamp and the publisher name for a certificate file', () => {
    const config = windowsSigningConfig({ ...release, ...pfx });
    expect(config.signtoolOptions).toEqual({
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      publisherName: 'Example',
    });
    expect(config.signExts).toContain('win32-x64\\uiohook-napi.node');
    expect(config.signExts?.some((ext) => ext.includes('linux') || ext.includes('darwin'))).toBe(
      false,
    );
    expect(config.verifyUpdateCodeSignature).toBe(true);
  });

  it('passes the Azure account settings through', () => {
    const config = windowsSigningConfig({ ...release, ...azure });
    expect(config.azureSignOptions).toMatchObject({
      publisherName: 'Example',
      codeSigningAccountName: 'acct',
      certificateProfileName: 'profile',
      fileDigest: 'SHA256',
    });
    expect(config.signtoolOptions).toBeUndefined();
  });

  it('leaves signing to the workflow for SignPath and skips it when unsigned', () => {
    expect(windowsSigningConfig({ ...release, ...signpath }).signExecutable).toBe(false);
    expect(windowsSigningConfig(release)).toEqual({
      verifyUpdateCodeSignature: false,
      signExecutable: false,
    });
  });
});

describe('evaluateSignature', () => {
  const good = { status: 'Valid', signerSubject: 'CN=Example', hasTimestamp: true };

  it('accepts a valid, timestamped signature', () => {
    expect(evaluateSignature(good, { publisher: 'Example' })).toEqual([]);
  });

  it('rejects unsigned, untimestamped and wrongly attributed files', () => {
    expect(
      evaluateSignature({ status: 'NotSigned', signerSubject: null, hasTimestamp: false }),
    ).toHaveLength(3);
    expect(evaluateSignature({ ...good, hasTimestamp: false })).toEqual(['no RFC 3161 timestamp']);
    expect(evaluateSignature(good, { publisher: 'Other' })).toEqual(['signer is not Other']);
  });

  it('accepts an untrusted root only when asked, for local test certificates', () => {
    const selfSigned = { ...good, status: 'UnknownError' };
    expect(evaluateSignature(selfSigned)).toHaveLength(1);
    expect(evaluateSignature(selfSigned, { allowUntrustedRoot: true })).toEqual([]);
    expect(
      evaluateSignature({ ...good, status: 'HashMismatch' }, { allowUntrustedRoot: true }),
    ).toHaveLength(1);
  });

  it('parses the PowerShell output', () => {
    expect(parseSignatureJson('{"status":"Valid","subject":"CN=A","timestamp":true}')).toEqual({
      status: 'Valid',
      signerSubject: 'CN=A',
      hasTimestamp: true,
    });
    expect(
      parseSignatureJson('{"status":"NotSigned","subject":null,"timestamp":false}').signerSubject,
    ).toBeNull();
    expect(() => parseSignatureJson('null')).toThrow();
  });
});

describe('requiring signing', () => {
  const requireFlag = { REQUIRE_WINDOWS_SIGNING: 'true' };

  it('fails when signing is required and no secret exists', () => {
    const decision = decideSigning({ ...release, ...requireFlag });
    expect(decision.failure).toContain('required');
    expect(decision.enabled).toBe(false);
    expect(decision.message).toContain('FAILED');
  });

  it('fails when signing is required and the secrets are only half set', () => {
    const half = { ...release, ...requireFlag, SIGNPATH_API_TOKEN: 't' };
    expect(decideSigning(half).failure).not.toBeNull();
  });

  it('fails when signing is required but this is not a tag build in the main repository', () => {
    const fork = { ...release, ...requireFlag, ...signpath, GITHUB_REPOSITORY: 'someone/scrim' };
    expect(decideSigning(fork).failure).toContain('not a tag build');
    const branch = { ...release, ...requireFlag, ...signpath, GITHUB_REF: 'refs/heads/main' };
    expect(decideSigning(branch).failure).not.toBeNull();
  });

  it('passes when signing is required and a provider is configured', () => {
    const decision = decideSigning({ ...release, ...requireFlag, ...signpath });
    expect(decision).toMatchObject({
      mode: 'signpath',
      enabled: true,
      failure: null,
      required: true,
    });
  });

  it('only the value true requires it, and unsigned stays allowed otherwise', () => {
    for (const value of ['false', '', '1', undefined]) {
      const decision = decideSigning({ ...release, REQUIRE_WINDOWS_SIGNING: value });
      expect(decision.failure).toBeNull();
      expect(decision.required).toBe(false);
    }
    expect(decideSigning({ ...release, REQUIRE_WINDOWS_SIGNING: ' TRUE ' }).required).toBe(true);
  });
});

describe('planSigning', () => {
  const none = { pfx: false, azure: false, signpath: false };
  const input = { required: false, dryRun: false, inCi: true, trusted: true, available: none };

  it('covers every combination of required, trusted and available secrets', () => {
    for (const required of [false, true]) {
      for (const trusted of [false, true]) {
        for (const signpathAvailable of [false, true]) {
          const decision = planSigning({
            ...input,
            required,
            trusted,
            available: { ...none, signpath: signpathAvailable },
          });
          const signs = trusted && signpathAvailable;
          expect(decision.enabled).toBe(signs);
          // An unsigned outcome is a failure exactly when signing is required.
          expect(decision.failure !== null).toBe(required && !signs);
        }
      }
    }
  });

  it('prefers a certificate file, then Azure, then SignPath', () => {
    const all = { pfx: true, azure: true, signpath: true };
    expect(planSigning({ ...input, available: all }).mode).toBe('pfx');
    expect(planSigning({ ...input, available: { ...all, pfx: false } }).mode).toBe('azure');
    const last = { ...all, pfx: false, azure: false };
    expect(planSigning({ ...input, available: last }).mode).toBe('signpath');
  });

  it('a developer machine is not CI, so it is never refused for being untrusted', () => {
    const local = { ...input, inCi: false, trusted: false, available: { ...none, pfx: true } };
    expect(planSigning(local).mode).toBe('pfx');
  });
});

describe('dry run', () => {
  const rehearsal = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'oyedokunken/scrim',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    SCRIM_SIGNING_DRY_RUN: 'true',
  };

  it('plans a hand started run in the main repository, marked as dry', () => {
    const decision = decideSigning({ ...rehearsal, ...signpath });
    expect(decision).toMatchObject({
      mode: 'signpath',
      enabled: true,
      dryRun: true,
      failure: null,
    });
    expect(decision.message).toContain('dry run');
  });

  it('is also switched on by the command line flag', () => {
    const env = { ...rehearsal, SCRIM_SIGNING_DRY_RUN: undefined, ...signpath };
    expect(decideSigning(env, true).dryRun).toBe(true);
    expect(decideSigning(env).dryRun).toBe(false);
  });

  it('still fails when signing is required and the secrets are missing', () => {
    expect(decideSigning({ ...rehearsal, REQUIRE_WINDOWS_SIGNING: 'true' }).failure).not.toBeNull();
  });

  it('does not make a fork or a manual run without the dry flag trusted', () => {
    const fork = { ...rehearsal, ...signpath, GITHUB_REPOSITORY: 'someone/scrim' };
    expect(decideSigning(fork).enabled).toBe(false);
    const live = { ...rehearsal, ...signpath, SCRIM_SIGNING_DRY_RUN: 'false' };
    expect(decideSigning(live).enabled).toBe(false);
  });
});

describe('the publisher of a signed build', () => {
  it('is the SignPath Foundation for SignPath, and the named publisher otherwise', () => {
    expect(windowsPublisher({ ...release, ...signpath })).toBe('SignPath Foundation');
    const named = { ...release, ...signpath, WIN_PUBLISHER_NAME: 'Acme Ltd' };
    expect(windowsPublisher(named)).toBe('Acme Ltd');
    expect(windowsPublisher({ ...release, ...pfx })).toBe('Example');
  });

  it('is empty for an unsigned build and for a dry run', () => {
    expect(windowsPublisher(release)).toBe('');
    expect(windowsPublisher({})).toBe('');
    expect(windowsPublisher({ ...release, ...signpath, SCRIM_SIGNING_DRY_RUN: 'true' })).toBe('');
  });

  it('is what the updater checks: win.signtoolOptions.publisherName for SignPath', () => {
    const config = windowsSigningConfig({ ...release, ...signpath });
    expect(config.signtoolOptions?.publisherName).toBe(SIGNPATH_PUBLISHER);
    expect(config.signtoolOptions?.signingHashAlgorithms).toEqual(['sha256']);
    expect(config.signtoolOptions?.rfc3161TimeStampServer).toMatch(/^http:\/\/timestamp\./);
    expect(config.verifyUpdateCodeSignature).toBe(true);
    expect(config.signExecutable).toBe(false);
  });

  it('has no publisher and no update signature check when unsigned', () => {
    const config = windowsSigningConfig(release);
    expect(config.signtoolOptions).toBeUndefined();
    expect(config.verifyUpdateCodeSignature).toBe(false);
  });
});
