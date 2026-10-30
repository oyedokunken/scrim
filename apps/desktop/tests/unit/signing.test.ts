import { describe, expect, it } from 'vitest';
import { decideSigning, windowsSigningConfig, type SigningEnv } from '../../build/signing.mts';
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
