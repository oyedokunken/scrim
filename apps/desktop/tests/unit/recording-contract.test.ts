import { describe, expect, it } from 'vitest';
import { contract, events } from '../../src/shared/ipc-contract';

const display = { kind: 'display' } as const;
const devices = { camera: { enabled: false }, mic: { enabled: true, deviceId: 'mic-1' } };

const input = (channel: keyof typeof contract, value: unknown) =>
  contract[channel].input.safeParse(value).success;
const output = (channel: keyof typeof contract, value: unknown) =>
  contract[channel].output.safeParse(value).success;

const finished = {
  folder: 'C:\\Recordings\\take 1',
  name: 'take 1',
  files: [{ kind: 'screen', path: 'C:\\Recordings\\take 1\\screen.webm' }],
  durationMs: 1000,
  bytes: 10,
  recovered: false,
  warnings: [],
};
const bridgeError = {
  code: 'disk-full',
  message: 'The disk is full.',
  nextStep: 'Free some space.',
};
const snapshot = {
  phase: 'recording',
  elapsedMs: 10,
  bytesWritten: 10,
  tracks: [{ kind: 'screen', bytesWritten: 10, ended: false }],
  warnings: [],
};

describe('recording:start input', () => {
  it.each([
    ['a display', { source: display, ...devices }],
    ['a display on a chosen monitor', { source: { kind: 'display', displayId: '2' }, ...devices }],
    [
      'a region',
      { source: { kind: 'region', crop: { x: 0, y: 0, width: 640, height: 360 } }, ...devices },
    ],
    ['a window', { source: { kind: 'window', sourceId: 'window:42:0' }, ...devices }],
    ['a name', { source: display, ...devices, name: 'Intro take' }],
  ])('accepts %s', (_name, value) => {
    expect(input('recording:start', value)).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['no source', devices],
    ['no devices', { source: display }],
    [
      'a destination, which only the main process may choose',
      { source: display, ...devices, destination: 'C:\\x' },
    ],
    ['an unknown source kind', { source: { kind: 'desktop' }, ...devices }],
    ['a region with no crop', { source: { kind: 'region' }, ...devices }],
    [
      'a crop with no area',
      { source: { kind: 'region', crop: { x: 0, y: 0, width: 0, height: 10 } }, ...devices },
    ],
    [
      'a crop that is not finite',
      {
        source: { kind: 'region', crop: { x: Infinity, y: 0, width: 10, height: 10 } },
        ...devices,
      },
    ],
    ['a window with no source id', { source: { kind: 'window' }, ...devices }],
    ['a stray key on the source', { source: { kind: 'display', extra: 1 }, ...devices }],
    [
      'a camera flag that is not a boolean',
      { source: display, camera: { enabled: 'yes' }, mic: { enabled: false } },
    ],
    [
      'an empty device id',
      { source: display, camera: { enabled: true, deviceId: '' }, mic: { enabled: false } },
    ],
    ['an empty name', { source: display, ...devices, name: '' }],
    ['a name that is too long', { source: display, ...devices, name: 'x'.repeat(201) }],
  ])('rejects %s', (_name, value) => {
    expect(input('recording:start', value)).toBe(false);
  });
});

describe('the other recording inputs', () => {
  it.each([
    'recording:pause',
    'recording:resume',
    'recording:stop',
    'recording:snapshot',
    'recording:list-recoverable',
  ] as const)('%s takes no input', (channel) => {
    expect(input(channel, undefined)).toBe(true);
    expect(input(channel, {})).toBe(false);
  });

  it.each(['recording:recover', 'recording:dismiss'] as const)(
    '%s takes exactly one folder',
    (channel) => {
      expect(input(channel, { folder: 'C:\\Recordings\\take 1' })).toBe(true);
      expect(input(channel, {})).toBe(false);
      expect(input(channel, { folder: '' })).toBe(false);
      expect(input(channel, { folder: 'C:\\a', extra: 1 })).toBe(false);
      expect(input(channel, undefined)).toBe(false);
    },
  );
});

describe('recording outputs', () => {
  it('accepts a success and a failure, as an outcome', () => {
    expect(output('recording:stop', { ok: true, value: finished })).toBe(true);
    expect(output('recording:stop', { ok: false, error: bridgeError })).toBe(true);
    expect(output('recording:pause', { ok: true, value: undefined })).toBe(true);
    expect(output('recording:start', { ok: true, value: {} })).toBe(true);
  });

  it('refuses an error that carries its technical detail, so a path can never leak', () => {
    expect(
      output('recording:stop', {
        ok: false,
        error: { ...bridgeError, detail: 'ENOSPC write C:\\Users\\zainab\\x' },
      }),
    ).toBe(false);
  });

  it('refuses an outcome that is both, or neither', () => {
    expect(output('recording:stop', { ok: true, value: finished, error: bridgeError })).toBe(false);
    expect(output('recording:stop', { ok: true })).toBe(false);
  });

  it('refuses a state that carries the session folder', () => {
    expect(output('recording:snapshot', snapshot)).toBe(true);
    expect(output('recording:snapshot', { ...snapshot, folder: 'C:\\Recordings\\take 1' })).toBe(
      false,
    );
  });

  it('refuses a phase the engine does not have', () => {
    expect(output('recording:snapshot', { ...snapshot, phase: 'exploding' })).toBe(false);
  });

  it('lists recoverable recordings with their size and time', () => {
    const one = { folder: 'C:\\r\\a', name: 'a', createdAt: '2026-10-28T10:00:00Z', bytes: 5 };
    expect(output('recording:list-recoverable', [one])).toBe(true);
    expect(output('recording:list-recoverable', [{ ...one, bytes: -1 }])).toBe(false);
  });
});

describe('recording events', () => {
  it('validate the same shapes as the calls', () => {
    expect(events['recording:state'].safeParse(snapshot).success).toBe(true);
    expect(events['recording:finished'].safeParse(finished).success).toBe(true);
    expect(events['recording:error'].safeParse(bridgeError).success).toBe(true);
    expect(
      events['recording:warning'].safeParse({ code: 'camera-lost', message: 'The camera stopped.' })
        .success,
    ).toBe(true);
  });

  it('refuse an error with a detail field or a warning with an unknown code', () => {
    expect(events['recording:error'].safeParse({ ...bridgeError, detail: 'x' }).success).toBe(
      false,
    );
    expect(events['recording:warning'].safeParse({ code: 'bad', message: 'x' }).success).toBe(
      false,
    );
  });
});
