import { FFMPEG_PIN } from './ffmpeg-pin.mts';

/**
 * Where the bundled FFmpeg comes from on the systems other than Windows x64 (which keeps its own
 * pin in `ffmpeg-pin.mts`). Every entry is an LGPL build with no libx264 and no GPL parts. See
 * ADR 0007 and docs/releasing.md.
 *
 * - Linux x64: the BtbN static LGPL build from the same release as the Windows one, so one tag
 *   covers both. Downloaded, hash checked and unpacked by `fetch-ffmpeg-unix.mts`.
 * - macOS: there is no maintained prebuilt LGPL build we can pin, so the release workflow builds
 *   the official source tarball with `build-ffmpeg-mac.sh` (GPL and nonfree switched off,
 *   VideoToolbox for H.264). The tarball is pinned by hash here, so the input is fixed.
 */

export const LINUX_X64_PIN = {
  tag: FFMPEG_PIN.tag,
  file: 'ffmpeg-n8.1.3-24-g92611900bb-linux64-lgpl-8.1.tar.xz',
  sha256: '75734a2604fbbf653256ac9d29bf88499d217b0c5c6d7c4a2a1f7b1f93073b55',
  sourceCommit: FFMPEG_PIN.sourceCommit,
} as const;

export const MAC_SOURCE_PIN = {
  version: '8.1.3',
  file: 'ffmpeg-8.1.3.tar.xz',
  url: 'https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz',
  sha256: '7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3',
} as const;

export type ReleaseTarget = 'linux-x64' | 'darwin-x64' | 'darwin-arm64';

export type FfmpegSource =
  | { kind: 'download'; url: string; file: string; sha256: string; buildPage: string }
  | { kind: 'build-from-source'; script: string; sourceUrl: string; sha256: string };

/** The target name for a platform and architecture, or undefined when we do not ship one. */
export function releaseTargetFor(platform: string, arch: string): ReleaseTarget | undefined {
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  return undefined;
}

export function ffmpegSourceFor(target: ReleaseTarget): FfmpegSource {
  if (target === 'linux-x64') {
    return {
      kind: 'download',
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${LINUX_X64_PIN.tag}/${LINUX_X64_PIN.file}`,
      file: LINUX_X64_PIN.file,
      sha256: LINUX_X64_PIN.sha256,
      buildPage: `https://github.com/BtbN/FFmpeg-Builds/releases/tag/${LINUX_X64_PIN.tag}`,
    };
  }
  return {
    kind: 'build-from-source',
    script: 'scripts/build-ffmpeg-mac.sh',
    sourceUrl: MAC_SOURCE_PIN.url,
    sha256: MAC_SOURCE_PIN.sha256,
  };
}

/** The files the app needs from an FFmpeg folder, per target. */
export const FFMPEG_UNIX_BINARIES = ['ffmpeg', 'ffprobe'] as const;
