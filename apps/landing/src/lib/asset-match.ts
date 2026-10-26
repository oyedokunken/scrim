import type { SystemValue } from './download-request';

export interface AssetLike {
  name: string;
  url: string;
  size: number;
}

export interface AssetWanted {
  os: SystemValue;
  arch?: 'x64' | 'arm64' | undefined;
  format?: 'appimage' | 'deb' | undefined;
}

const ARM = /arm64|aarch64/i;
const X64 = /x64|amd64|x86_64|x86-64/i;
const UNIVERSAL = /universal/i;
/** Checksums, signatures and update metadata that sit beside installers but are not installers. */
const NOT_AN_INSTALLER = /\.(blockmap|yml|yaml|sha256|sha512|sig|asc|txt|json)$/i;

function extensions(wanted: AssetWanted): readonly string[] {
  switch (wanted.os) {
    case 'windows':
      return ['.exe', '.msi'];
    case 'macos':
      return ['.dmg'];
    case 'linux':
      return wanted.format === 'deb' ? ['.deb'] : ['.appimage'];
  }
}

/**
 * How well an asset suits the wanted architecture, or 0 when it is the wrong one. A file that
 * names no architecture counts as 64 bit Intel, which is what an installer without a label is.
 */
function archScore(name: string, wanted: AssetWanted): number {
  const arch = wanted.arch ?? 'x64';
  const isArm = ARM.test(name);
  const isX64 = X64.test(name);
  if (UNIVERSAL.test(name) && wanted.os === 'macos') {
    return 2;
  }
  if (arch === 'arm64') {
    return isArm ? 3 : 0;
  }
  if (isArm) {
    return 0;
  }
  return isX64 ? 3 : 1;
}

/**
 * Picks the installer that fits a visitor's system from a release's files, or `null` when none
 * does. It looks at the extension and the architecture in the name. A wrong guess would hand
 * someone a program that cannot run, so when nothing fits it returns `null` instead of the
 * nearest file, and the caller sends the visitor to the Releases page.
 */
export function matchAsset(assets: readonly AssetLike[], wanted: AssetWanted): AssetLike | null {
  const wantedExtensions = extensions(wanted);
  let best: { asset: AssetLike; score: number; rank: number } | null = null;

  for (const asset of assets) {
    if (NOT_AN_INSTALLER.test(asset.name)) {
      continue;
    }
    const lower = asset.name.toLowerCase();
    const rank = wantedExtensions.findIndex((extension) => lower.endsWith(extension));
    if (rank === -1) {
      continue;
    }
    const score = archScore(asset.name, wanted);
    if (score === 0) {
      continue;
    }
    if (best === null || score > best.score || (score === best.score && rank < best.rank)) {
      best = { asset, score, rank };
    }
  }
  return best?.asset ?? null;
}
