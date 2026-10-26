import { describe, expect, it } from 'vitest';
import {
  extensionForMime,
  inputLogFileName,
  playableExtensionForMime,
  playableTrackFile,
  rawTrackFile,
  sanitizeName,
  sessionFileSchema,
  sessionFolderName,
  uniqueSessionFolder,
  type SessionFile,
} from '../src';

const valid: SessionFile = {
  version: 1,
  id: '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11',
  name: 'Demo',
  createdAt: '2026-10-26T12:00:00.000Z',
  app: { version: '0.0.0', os: 'windows', arch: 'x64' },
  pid: 4242,
  source: { kind: 'display', displayId: '1', origin: { x: 0, y: 0 }, scaleFactor: 1.25 },
  capture: { cursorInCapture: true },
  tracks: [
    {
      kind: 'screen',
      file: 'screen.raw.webm',
      mimeType: 'video/webm;codecs=vp9',
      startedAt: 12,
      bytesWritten: 1024,
      complete: false,
    },
  ],
  clock: { rendererOffsetMs: -3.5, uncertaintyMs: 0.4 },
  pauses: [{ pausedAt: 1000, resumedAt: null }],
  input: { status: 'recorded', file: 'input.ndjson' },
  warnings: [],
  heartbeatAt: '2026-10-26T12:00:02.000Z',
  heartbeatElapsedMs: 2000,
  cleanClose: false,
};

describe('sessionFileSchema', () => {
  it('accepts a full session, with an open pause', () => {
    expect(sessionFileSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts unavailable input with a reason, and recovered sessions', () => {
    const session = {
      ...valid,
      input: { status: 'unavailable', reason: 'wayland' },
      recovered: true,
      cleanClose: true,
    };
    expect(sessionFileSchema.safeParse(session).success).toBe(true);
  });

  it.each([
    ['a wrong version', { ...valid, version: 2 }],
    ['an id that is not a uuid', { ...valid, id: 'abc' }],
    ['an empty name', { ...valid, name: '' }],
    ['a name over 200 characters', { ...valid, name: 'a'.repeat(201) }],
    ['a bad date', { ...valid, heartbeatAt: 'yesterday' }],
    ['a negative heartbeat time', { ...valid, heartbeatElapsedMs: -1 }],
    ['a pid of zero', { ...valid, pid: 0 }],
    ['an unknown field', { ...valid, extra: true }],
    ['negative bytes', { ...valid, tracks: [{ ...valid.tracks[0], bytesWritten: -1 }] }],
    ['a fractional byte count', { ...valid, tracks: [{ ...valid.tracks[0], bytesWritten: 1.5 }] }],
    ['an unknown track kind', { ...valid, tracks: [{ ...valid.tracks[0], kind: 'keys' }] }],
    ['an unknown input reason', { ...valid, input: { status: 'unavailable', reason: 'bored' } }],
    ['a scale factor of zero', { ...valid, source: { ...valid.source, scaleFactor: 0 } }],
    ['a negative uncertainty', { ...valid, clock: { rendererOffsetMs: 0, uncertaintyMs: -1 } }],
  ])('rejects %s', (_label, session) => {
    expect(sessionFileSchema.safeParse(session).success).toBe(false);
  });
});

describe('sanitizeName', () => {
  it.each([
    ['My demo', 'My demo'],
    ['a/b\\c', 'a b c'],
    ['what?*<>|"', 'what'],
    ['  spaced   out  ', 'spaced out'],
    ['trailing dots...', 'trailing dots'],
    ['.hidden', 'hidden'],
    ['', 'Recording'],
    ['???', 'Recording'],
    ['CON', 'CON recording'],
    ['nul.txt', 'nul.txt recording'],
    ['line\nbreak\ttab', 'line break tab'],
  ])('%j becomes %j', (input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
  });

  it('caps the length at 200 characters and leaves no trailing space', () => {
    const name = sanitizeName(`${'a'.repeat(199)} b`);
    expect(name.length).toBeLessThanOrEqual(200);
    expect(name.endsWith(' ')).toBe(false);
  });
});

describe('layout names', () => {
  it('names folders and logs after the recording', () => {
    expect(sessionFolderName('Demo: one')).toBe('Demo one.scrim');
    expect(inputLogFileName('Demo')).toBe('Demo.scrim.json');
  });

  it('picks the extension from the recorder type', () => {
    expect(extensionForMime('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensionForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(rawTrackFile('screen', 'video/mp4')).toBe('screen.raw.mp4');
    expect(rawTrackFile('mic', 'audio/webm;codecs=opus')).toBe('mic.raw.webm');
    expect(playableTrackFile('camera', 'video/webm;codecs=vp9')).toBe('camera.webm');
    expect(playableTrackFile('screen', 'video/webm;codecs=h264')).toBe('screen.mp4');
    expect(playableTrackFile('screen', 'video/mp4;codecs=avc1')).toBe('screen.mp4');
    expect(playableExtensionForMime('video/webm;codecs=vp8')).toBe('webm');
    expect(playableTrackFile('mic', 'audio/webm;codecs=opus')).toBe('mic.webm');
  });

  it('never reuses a folder name', () => {
    const taken = new Set(['Demo.scrim', 'Demo 2.scrim']);
    expect(uniqueSessionFolder('Demo', (folder) => taken.has(folder))).toBe('Demo 3.scrim');
    expect(uniqueSessionFolder('Fresh', (folder) => taken.has(folder))).toBe('Fresh.scrim');
  });
});

describe('crop and window bounds in the session file', () => {
  it('accepts a region with its crop in device independent and physical pixels', () => {
    const session = {
      ...valid,
      source: {
        ...valid.source,
        kind: 'region' as const,
        crop: { x: 100, y: 50, width: 640, height: 360 },
        cropPx: { x: 150, y: 75, width: 960, height: 540 },
      },
    };
    expect(sessionFileSchema.safeParse(session).success).toBe(true);
  });

  it('accepts recorded and unavailable window bounds, and rejects anything else', () => {
    const base = { ...valid, source: { ...valid.source, kind: 'window' as const } };
    expect(
      sessionFileSchema.safeParse({
        ...base,
        windowBounds: { status: 'recorded', file: 'window-bounds.ndjson' },
      }).success,
    ).toBe(true);
    expect(
      sessionFileSchema.safeParse({ ...base, windowBounds: { status: 'unavailable' } }).success,
    ).toBe(true);
    expect(
      sessionFileSchema.safeParse({ ...base, windowBounds: { status: 'maybe' } }).success,
    ).toBe(false);
    expect(
      sessionFileSchema.safeParse({
        ...base,
        source: { ...base.source, cropPx: { x: 0, y: 0, width: 0, height: 10 } },
      }).success,
    ).toBe(false);
  });
});

describe('input that cannot follow a window', () => {
  it('accepts window-bounds-unsupported as a reason the mouse log is unavailable', () => {
    const session = {
      ...valid,
      source: { ...valid.source, kind: 'window' as const },
      input: { status: 'unavailable', reason: 'window-bounds-unsupported' },
    };
    expect(sessionFileSchema.safeParse(session).success).toBe(true);
  });
});
