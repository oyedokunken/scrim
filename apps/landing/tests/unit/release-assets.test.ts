import { describe, expect, it } from 'vitest';
import { matchAsset, type AssetLike } from '@/lib/asset-match';

const asset = (name: string): AssetLike => ({
  name,
  url: `https://github.com/oyedokunken/scrim/releases/download/v1.0.0/${name}`,
  size: 1,
});

/** File names as electron-builder writes them from the artifact names in the build config. */
const RELEASE = [
  'Scrim-Setup-1.0.0.exe',
  'Scrim-Setup-1.0.0.exe.blockmap',
  'Scrim-1.0.0-mac-arm64.dmg',
  'Scrim-1.0.0-mac-x64.dmg',
  'Scrim-1.0.0-linux-amd64.deb',
  'Scrim-1.0.0-linux-x86_64.AppImage',
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
  'SHA256SUMS',
  'SHA256SUMS.asc',
  'SHA256SUMS.txt',
  'Scrim-1.0.0-linux-amd64.deb.asc',
].map(asset);

describe('picking the installer from the real release file names', () => {
  it.each([
    ['Windows', { os: 'windows', arch: 'x64' }, 'Scrim-Setup-1.0.0.exe'],
    ['Windows with no chip known', { os: 'windows' }, 'Scrim-Setup-1.0.0.exe'],
    ['a Mac with Apple Silicon', { os: 'macos', arch: 'arm64' }, 'Scrim-1.0.0-mac-arm64.dmg'],
    ['an Intel Mac', { os: 'macos', arch: 'x64' }, 'Scrim-1.0.0-mac-x64.dmg'],
    ['Linux by default', { os: 'linux' }, 'Scrim-1.0.0-linux-amd64.deb'],
    ['Linux asking for the deb', { os: 'linux', format: 'deb' }, 'Scrim-1.0.0-linux-amd64.deb'],
    [
      'Linux asking for the AppImage',
      { os: 'linux', format: 'appimage' },
      'Scrim-1.0.0-linux-x86_64.AppImage',
    ],
  ] as const)('gives %s the right file', (_name, wanted, expected) => {
    expect(matchAsset(RELEASE, wanted)?.name).toBe(expected);
  });

  it('never offers checksums, signatures or update files', () => {
    for (const wanted of [
      { os: 'windows' },
      { os: 'macos' },
      { os: 'linux' },
      { os: 'linux', format: 'appimage' },
    ] as const) {
      expect(matchAsset(RELEASE, wanted)?.name).not.toMatch(/\.(yml|asc|txt|blockmap)$|SHA256/);
    }
  });

  it('finds nothing for a system whose installer is not published yet', () => {
    const windowsOnly = RELEASE.filter((file) => file.name.startsWith('Scrim-Setup-1.0.0.exe'));
    expect(matchAsset(windowsOnly, { os: 'macos', arch: 'arm64' })).toBeNull();
    expect(matchAsset(windowsOnly, { os: 'linux' })).toBeNull();
  });
});
