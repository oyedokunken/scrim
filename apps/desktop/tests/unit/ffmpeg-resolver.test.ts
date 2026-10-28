import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFfmpegPaths } from '../../src/main/recording/ffmpeg';
import {
  FFMPEG_BINARIES,
  FFMPEG_BUILD_PAGE,
  FFMPEG_PIN,
  FFMPEG_SOURCE_URL,
  FFMPEG_URL,
} from '../../scripts/ffmpeg-pin.mts';

describe('resolveFfmpegPaths', () => {
  it('uses the bundled build from the resources folder in a packaged app', () => {
    const paths = resolveFfmpegPaths({
      isPackaged: true,
      resourcesPath: 'C:/Program Files/Scrim/resources',
      platform: 'win32',
      env: { SCRIM_FFMPEG: 'D:/other/ffmpeg.exe' },
    });
    expect(paths.ffmpeg).toBe(join('C:/Program Files/Scrim/resources', 'ffmpeg', 'ffmpeg.exe'));
    expect(paths.ffprobe).toBe(join('C:/Program Files/Scrim/resources', 'ffmpeg', 'ffprobe.exe'));
  });

  it('ignores the override variables when packaged, so nothing can swap the binary', () => {
    const paths = resolveFfmpegPaths({
      isPackaged: true,
      resourcesPath: '/app/resources',
      platform: 'linux',
      env: { SCRIM_FFMPEG: '/tmp/evil', SCRIM_FFPROBE: '/tmp/evil' },
    });
    expect(paths.ffmpeg).toBe(join('/app/resources', 'ffmpeg', 'ffmpeg'));
    expect(paths.ffprobe).toBe(join('/app/resources', 'ffmpeg', 'ffprobe'));
  });

  it('uses the system FFmpeg in development, and the override variables when set', () => {
    const plain = resolveFfmpegPaths({
      isPackaged: false,
      resourcesPath: '/x',
      platform: 'win32',
      env: {},
    });
    expect(plain).toEqual({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
    const custom = resolveFfmpegPaths({
      isPackaged: false,
      resourcesPath: '/x',
      platform: 'win32',
      env: { SCRIM_FFMPEG: 'C:/t/ffmpeg.exe', SCRIM_FFPROBE: 'C:/t/ffprobe.exe' },
    });
    expect(custom).toEqual({ ffmpeg: 'C:/t/ffmpeg.exe', ffprobe: 'C:/t/ffprobe.exe' });
  });
});

describe('the FFmpeg pin', () => {
  it('names an LGPL build, never a GPL one, and a full length SHA-256', () => {
    expect(FFMPEG_PIN.file).toContain('-lgpl');
    // A plain GPL build is named `-gpl-` or `-gpl.`, with no `l` in front of it.
    expect(FFMPEG_PIN.file).not.toMatch(/-gpl[-.]/);
    expect(FFMPEG_PIN.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(FFMPEG_PIN.file.endsWith('.zip')).toBe(true);
  });

  it('points at the pinned release, not a moving latest tag', () => {
    expect(FFMPEG_URL).toContain(`/download/${FFMPEG_PIN.tag}/`);
    expect(FFMPEG_URL.endsWith(FFMPEG_PIN.file)).toBe(true);
    expect(FFMPEG_PIN.tag).not.toBe('latest');
    expect(FFMPEG_BUILD_PAGE).toContain(FFMPEG_PIN.tag);
    expect(FFMPEG_SOURCE_URL).toContain(FFMPEG_PIN.sourceCommit);
  });

  it('ships exactly ffmpeg and ffprobe', () => {
    expect([...FFMPEG_BINARIES]).toEqual(['ffmpeg.exe', 'ffprobe.exe']);
  });
});
