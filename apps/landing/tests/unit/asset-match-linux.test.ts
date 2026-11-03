import { describe, expect, it } from 'vitest';
import { matchAsset, type AssetLike } from '@/lib/asset-match';

/**
 * The rule the Linux release files follow: the format is the extension (.AppImage or .deb, any
 * case) and 64 bit Intel is one of x64, x86_64, amd64 or x86-64 in the name. electron-builder names
 * the files Scrim-<version>-linux-x86_64.AppImage and Scrim-<version>-linux-amd64.deb, which is
 * what a release holds. Signatures (.asc), checksums and update files are never offered.
 */
const asset = (name: string): AssetLike => ({
  name,
  url: `https://github.com/oyedokunken/scrim/releases/download/v1.2.0/${name}`,
  size: 1,
});

const release: AssetLike[] = [
  'Scrim-Setup-1.2.0.exe',
  'Scrim-1.2.0-mac-arm64.dmg',
  'Scrim-1.2.0-mac-x64.dmg',
  'Scrim-1.2.0-linux-x86_64.AppImage',
  'Scrim-1.2.0-linux-x86_64.AppImage.asc',
  'Scrim-1.2.0-linux-x86_64.AppImage.blockmap',
  'Scrim-1.2.0-linux-amd64.deb',
  'Scrim-1.2.0-linux-amd64.deb.asc',
  'SHA256SUMS.txt',
  'SHA256SUMS.txt.asc',
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
].map(asset);

describe('matching the Linux release files', () => {
  it('picks the AppImage for the AppImage format', () => {
    expect(matchAsset(release, { os: 'linux', arch: 'x64', format: 'appimage' })?.name).toBe(
      'Scrim-1.2.0-linux-x86_64.AppImage',
    );
  });

  it('picks the AppImage when the visitor chose no format', () => {
    expect(matchAsset(release, { os: 'linux', arch: 'x64' })?.name).toBe(
      'Scrim-1.2.0-linux-x86_64.AppImage',
    );
  });

  it('picks the deb for the deb format', () => {
    expect(matchAsset(release, { os: 'linux', arch: 'x64', format: 'deb' })?.name).toBe(
      'Scrim-1.2.0-linux-amd64.deb',
    );
  });

  it.each(['x64', 'x86_64', 'amd64', 'x86-64'])('reads %s as 64 bit Intel', (token) => {
    expect(
      matchAsset([asset(`Scrim-1.2.0-linux-${token}.deb`)], {
        os: 'linux',
        arch: 'x64',
        format: 'deb',
      }),
    ).not.toBeNull();
  });

  it('never offers a signature, a checksum or an update file', () => {
    const only = ['x.AppImage.asc', 'x.deb.asc', 'SHA256SUMS.txt', 'latest-linux.yml'].map(asset);
    expect(matchAsset(only, { os: 'linux', arch: 'x64', format: 'deb' })).toBeNull();
    expect(matchAsset(only, { os: 'linux', arch: 'x64', format: 'appimage' })).toBeNull();
  });

  it('refuses an arm64 file for an x64 visitor', () => {
    const arm = [asset('Scrim-1.2.0-linux-arm64.AppImage'), asset('Scrim-1.2.0-linux-aarch64.deb')];
    expect(matchAsset(arm, { os: 'linux', arch: 'x64', format: 'deb' })).toBeNull();
    expect(matchAsset(arm, { os: 'linux', arch: 'x64', format: 'appimage' })).toBeNull();
  });

  it('does not hand a Linux visitor a Windows or Mac file', () => {
    const others = release.filter((a) => /exe|dmg/.test(a.name));
    expect(matchAsset(others, { os: 'linux', arch: 'x64', format: 'appimage' })).toBeNull();
  });
});
