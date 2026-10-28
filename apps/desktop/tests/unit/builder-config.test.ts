import { describe, expect, it } from 'vitest';
import config from '../../electron-builder.config';
import { resolveFfmpegPaths } from '../../src/main/recording/ffmpeg';

describe('the installer configuration', () => {
  it('does not rebuild native modules', () => {
    expect(config.npmRebuild).toBe(false);
  });

  it('puts FFmpeg next to the app, where the resolver looks for it', () => {
    expect(config.extraResources).toEqual([{ from: 'resources/ffmpeg', to: 'ffmpeg' }]);
    const paths = resolveFfmpegPaths({
      isPackaged: true,
      resourcesPath: 'RES',
      platform: 'win32',
      env: {},
    });
    expect(paths.ffmpeg.split(String.fromCharCode(92)).join('/')).toBe('RES/ffmpeg/ffmpeg.exe');
  });

  it('unpacks the native mouse hook from the archive', () => {
    expect(config.asarUnpack).toContain('node_modules/uiohook-napi/**');
  });
});
