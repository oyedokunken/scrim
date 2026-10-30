import { describe, expect, it } from 'vitest';
import {
  FFMPEG_UNIX_BINARIES,
  LINUX_X64_PIN,
  MAC_SOURCE_PIN,
  ffmpegSourceFor,
  releaseTargetFor,
} from '../../scripts/ffmpeg-targets.mts';
import { FFMPEG_PIN } from '../../scripts/ffmpeg-pin.mts';
import config from '../../electron-builder.config';

describe('release targets', () => {
  it('maps platform and architecture to a target, and nothing else', () => {
    expect(releaseTargetFor('linux', 'x64')).toBe('linux-x64');
    expect(releaseTargetFor('darwin', 'x64')).toBe('darwin-x64');
    expect(releaseTargetFor('darwin', 'arm64')).toBe('darwin-arm64');
    expect(releaseTargetFor('linux', 'arm64')).toBeUndefined();
    expect(releaseTargetFor('win32', 'x64')).toBeUndefined();
  });

  it('pins the Linux build as LGPL, from the same release as Windows, with a full hash', () => {
    expect(LINUX_X64_PIN.file).toContain('-lgpl');
    expect(LINUX_X64_PIN.file).not.toMatch(/-gpl[-.]/);
    expect(LINUX_X64_PIN.file).toContain('linux64');
    expect(LINUX_X64_PIN.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(LINUX_X64_PIN.tag).toBe(FFMPEG_PIN.tag);
    const source = ffmpegSourceFor('linux-x64');
    expect(source.kind).toBe('download');
    if (source.kind === 'download') {
      expect(source.url).toContain(`/download/${LINUX_X64_PIN.tag}/`);
      expect(source.url.endsWith(LINUX_X64_PIN.file)).toBe(true);
    }
  });

  it('builds macOS from the official source tarball with a pinned hash', () => {
    expect(MAC_SOURCE_PIN.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(MAC_SOURCE_PIN.url).toBe(
      `https://ffmpeg.org/releases/ffmpeg-${MAC_SOURCE_PIN.version}.tar.xz`,
    );
    for (const target of ['darwin-x64', 'darwin-arm64'] as const) {
      expect(ffmpegSourceFor(target).kind).toBe('build-from-source');
    }
  });

  it('ships ffmpeg and ffprobe without an extension off Windows', () => {
    expect([...FFMPEG_UNIX_BINARIES]).toEqual(['ffmpeg', 'ffprobe']);
  });
});

describe('the mac and linux installer configuration', () => {
  it('uses the hardened runtime with entitlements for audio, camera and the JIT', () => {
    expect(config.mac?.hardenedRuntime).toBe(true);
    expect(config.mac?.entitlements).toBe('build/entitlements.mac.plist');
    expect(config.mac?.entitlementsInherit).toBe('build/entitlements.mac.plist');
    const info: unknown = config.mac?.extendInfo;
    expect(info).toHaveProperty('NSCameraUsageDescription');
    expect(info).toHaveProperty('NSMicrophoneUsageDescription');
  });

  it('names installers with the architecture so the website can match them', () => {
    expect(config.mac?.artifactName).toContain('${arch}');
    expect(config.linux?.artifactName).toContain('${arch}');
    expect(config.linux?.target).toEqual(['AppImage', 'deb']);
  });

  it('leaves the Windows target untouched', () => {
    expect(config.win).toMatchObject({ target: ['nsis'], icon: 'resources/icons/icon.ico' });
    expect(config.extraResources).toEqual([{ from: 'resources/ffmpeg', to: 'ffmpeg' }]);
  });
});
