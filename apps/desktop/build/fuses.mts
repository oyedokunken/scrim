import { FuseV1Options, FuseVersion, type FuseV1Config } from '@electron/fuses';

/**
 * The Electron fuses baked into every packaged build. A snapshot test locks this object and
 * `verify-fuses.mts` reads the real binary back and compares, so a change needs review and an ADR.
 *
 * Keys are the fuse names that `electron-fuses read` prints.
 */
export const FUSES = Object.freeze({
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  // The renderer loads from the app protocol, so file:// pages get no extra privileges.
  GrantFileProtocolExtraPrivileges: false,
} as const);

type FuseName = keyof typeof FUSES;

/** The config passed to `flipFuses`. */
export function toFlipConfig(): FuseV1Config {
  return {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
    [FuseV1Options.RunAsNode]: FUSES.RunAsNode,
    [FuseV1Options.EnableCookieEncryption]: FUSES.EnableCookieEncryption,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]:
      FUSES.EnableNodeOptionsEnvironmentVariable,
    [FuseV1Options.EnableNodeCliInspectArguments]: FUSES.EnableNodeCliInspectArguments,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:
      FUSES.EnableEmbeddedAsarIntegrityValidation,
    [FuseV1Options.OnlyLoadAppFromAsar]: FUSES.OnlyLoadAppFromAsar,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: FUSES.GrantFileProtocolExtraPrivileges,
  };
}

/**
 * Removes terminal color codes in one pass. The fuses tool colors its report when a build runs in
 * a terminal that supports color, as the Linux build container does, and the codes would hide
 * every line from the parser below.
 */
export function withoutColors(text: string): string {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.charCodeAt(index) === 27 && text.charAt(index + 1) === '[') {
      index += 2;
      while (index < text.length && !/[A-Za-z]/.test(text.charAt(index))) index += 1;
      index += 1;
    } else {
      out += text.charAt(index);
      index += 1;
    }
  }
  return out;
}

/** Parses the output of `electron-fuses read` into name and state pairs. */
export function parseFuseReport(report: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const line of withoutColors(report).split(/\r?\n/)) {
    const match = /^\s*(\w+) is (Enabled|Disabled)\s*$/.exec(line);
    if (match?.[1] && match[2]) result[match[1]] = match[2] === 'Enabled';
  }
  return result;
}

/** Lists every fuse in the constant whose real value differs, or is missing. */
export function diffFuses(actual: Record<string, boolean>): string[] {
  return (Object.keys(FUSES) as FuseName[]).flatMap((name) => {
    const found = actual[name];
    if (found === FUSES[name]) return [];
    const have = found === undefined ? 'missing' : found ? 'enabled' : 'disabled';
    return [`${name}: expected ${FUSES[name] ? 'enabled' : 'disabled'}, found ${have}`];
  });
}
