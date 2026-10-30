import { describe, expect, it } from 'vitest';
import { errorFromFs, makeError, WARNINGS } from '../../src/main/recording/messages';
import type { RecordingErrorCode } from '../../src/main/recording/types';

const CODES: RecordingErrorCode[] = [
  'invalid-state',
  'disk-too-full',
  'disk-full',
  'folder-not-writable',
  'folder-unavailable',
  'write-failed',
  'screen-permission',
  'screen-unavailable',
  'display-removed',
  'recorder-failed',
  'recorder-crashed',
  'ffmpeg-missing',
  'remux-failed',
  'nothing-recoverable',
  'unknown',
];

describe('recording error messages', () => {
  it.each(CODES)('%s says what happened and what to do next, in plain words', (code) => {
    const error = makeError(code, 'EIO');
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.nextStep.length).toBeGreaterThan(10);
    for (const text of [error.message, error.nextStep]) {
      expect(text).not.toMatch(/\u2014|\u2013|[\u{1F300}-\u{1FAFF}]/u);
      expect(text).not.toMatch(/[A-Z]:\|\/Users\//);
    }
  });

  it('does not tell people to install FFmpeg, which the app carries itself', () => {
    expect(makeError('ffmpeg-missing').nextStep).not.toMatch(/install ffmpeg/i);
  });

  it('maps a full disk, a refused folder and a vanished folder before and during recording', () => {
    const errno = (code: string) => Object.assign(new Error(code), { code });
    expect(errorFromFs(errno('ENOSPC'), 'start').code).toBe('disk-too-full');
    expect(errorFromFs(errno('ENOSPC'), 'recording').code).toBe('disk-full');
    expect(errorFromFs(errno('EACCES'), 'start').code).toBe('folder-not-writable');
    expect(errorFromFs(errno('EACCES'), 'recording').code).toBe('write-failed');
    expect(errorFromFs(errno('ENOENT'), 'start').code).toBe('folder-not-writable');
    expect(errorFromFs(errno('ENOENT'), 'recording').code).toBe('folder-unavailable');
  });

  it('has a plain warning for an unplugged camera and microphone', () => {
    expect(WARNINGS.deviceLost('camera').message).toMatch(/camera/i);
    expect(WARNINGS.deviceLost('mic').message).toMatch(/microphone/i);
  });
});
