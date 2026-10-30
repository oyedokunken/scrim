// Checks the Authenticode signature of each file given on the command line (Windows only).
//   node build/verify-signature.mts [--publisher "Name"] [--allow-untrusted-root] file...
// Exit code 1 when any file is unsigned, invalid, not timestamped or signed by the wrong subject.
import { spawnSync } from 'node:child_process';

export interface SignatureInfo {
  readonly status: string;
  readonly signerSubject: string | null;
  readonly hasTimestamp: boolean;
}

export interface VerifyOptions {
  /** Part of the signer subject that must appear, for example the publisher name. */
  readonly publisher?: string | undefined;
  /** A self signed test certificate has an untrusted root. Only for local tests. */
  readonly allowUntrustedRoot?: boolean;
}

/** Returns a list of problems. Empty means the signature is acceptable. */
export function evaluateSignature(info: SignatureInfo, options: VerifyOptions = {}): string[] {
  const problems: string[] = [];
  const untrustedOk = options.allowUntrustedRoot === true && info.status === 'UnknownError';
  if (info.status !== 'Valid' && !untrustedOk) {
    problems.push(`status is ${info.status}, expected Valid`);
  }
  if (info.signerSubject === null) {
    problems.push('no signer certificate');
  } else if (options.publisher && !info.signerSubject.includes(options.publisher)) {
    problems.push(`signer is not ${options.publisher}`);
  }
  if (!info.hasTimestamp) {
    problems.push('no RFC 3161 timestamp');
  }
  return problems;
}

/** Reads the JSON that the PowerShell snippet below prints. */
export function parseSignatureJson(text: string): SignatureInfo {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Unexpected signature output.');
  }
  const record = raw as Record<string, unknown>;
  return {
    status: typeof record['status'] === 'string' ? record['status'] : 'Unknown',
    signerSubject: typeof record['subject'] === 'string' ? record['subject'] : null,
    hasTimestamp: record['timestamp'] === true,
  };
}

const SCRIPT =
  '$s = Get-AuthenticodeSignature -LiteralPath $env:SCRIM_VERIFY_FILE; ' +
  '[pscustomobject]@{ status = [string]$s.Status; subject = $s.SignerCertificate.Subject; ' +
  'timestamp = ($null -ne $s.TimeStamperCertificate) } | ConvertTo-Json -Compress';

function inspect(file: string): SignatureInfo {
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, SCRIM_VERIFY_FILE: file },
  });
  if (result.status !== 0) {
    throw new Error(`Could not read the signature of ${file}: ${result.stderr}`);
  }
  return parseSignatureJson(result.stdout);
}

function main(argv: readonly string[]): number {
  const files: string[] = [];
  let publisher: string | undefined;
  let allowUntrustedRoot = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--publisher') {
      publisher = argv[(index += 1)];
    } else if (arg === '--allow-untrusted-root') {
      allowUntrustedRoot = true;
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) {
    console.error('Give at least one file to check.');
    return 2;
  }
  let failed = false;
  for (const file of files) {
    const problems = evaluateSignature(inspect(file), { publisher, allowUntrustedRoot });
    console.log(
      `${problems.length === 0 ? 'signed  ' : 'PROBLEM '} ${file} ${problems.join('; ')}`,
    );
    failed ||= problems.length > 0;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? '')) {
  process.exitCode = main(process.argv.slice(2));
}
