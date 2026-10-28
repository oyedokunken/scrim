import { describe, expect, it, vi } from 'vitest';
import {
  createRecordingHandlers,
  toBridgeEvent,
  toBridgeSnapshot,
} from '../../src/main/ipc/recording-handlers';
import { contract, events } from '../../src/shared/ipc-contract';
import { error, fakeRecording, finished, snapshot } from './support/recording-api-fake';

const display = { kind: 'display' } as const;
const devices = { camera: { enabled: true, deviceId: 'cam-1' }, mic: { enabled: false } };

function setup(destination: string | null = 'C:\\Recordings', recording = fakeRecording()) {
  return {
    handlers: createRecordingHandlers({ recording, destination: () => destination }),
    recording,
  };
}

describe('recording:start', () => {
  it('records what the page chose, and saves where the person chose', async () => {
    const { handlers, recording } = setup('C:\\Recordings');
    const result = await handlers['recording:start']({
      source: display,
      ...devices,
      name: 'Intro',
    });
    expect(result).toEqual({ ok: true, value: {} });
    expect(recording.start).toHaveBeenCalledWith({
      source: display,
      camera: { enabled: true, deviceId: 'cam-1' },
      mic: { enabled: false },
      destination: 'C:\\Recordings',
      name: 'Intro',
    });
  });

  it('leaves the destination out when none was chosen, so the engine uses its default', async () => {
    const { handlers, recording } = setup(null);
    await handlers['recording:start']({ source: display, ...devices });
    const options = vi.mocked(recording.start).mock.calls[0]?.[0];
    expect(options).not.toHaveProperty('destination');
    expect(options).not.toHaveProperty('name');
  });

  it('hands the failure back as an outcome, with no technical detail, and the result fits the contract', async () => {
    const { handlers } = setup(
      'C:\\Recordings',
      fakeRecording({ start: () => Promise.resolve({ ok: false, error }) }),
    );
    const result = await handlers['recording:start']({ source: display, ...devices });
    expect(result).toEqual({
      ok: false,
      error: { code: 'disk-full', message: error.message, nextStep: error.nextStep },
    });
    expect(JSON.stringify(result)).not.toMatch(/zainab|ENOSPC/);
    expect(contract['recording:start'].output.safeParse(result).success).toBe(true);
  });
});

describe('pause, resume and stop', () => {
  it('pass through and keep the outcome shape', async () => {
    const { handlers, recording } = setup();
    expect(await handlers['recording:pause'](undefined)).toEqual({ ok: true, value: undefined });
    expect(await handlers['recording:resume'](undefined)).toEqual({ ok: true, value: undefined });
    const stopped = await handlers['recording:stop'](undefined);
    expect(recording.pause).toHaveBeenCalledOnce();
    expect(recording.resume).toHaveBeenCalledOnce();
    expect(contract['recording:stop'].output.safeParse(stopped).success).toBe(true);
    expect(stopped).toMatchObject({
      ok: true,
      value: { folder: finished.folder, durationMs: 12_000 },
    });
  });

  it('returns a failed pause as an error outcome', async () => {
    const { handlers } = setup(
      null,
      fakeRecording({
        pause: () => Promise.resolve({ ok: false, error: { ...error, code: 'invalid-state' } }),
      }),
    );
    const result = await handlers['recording:pause'](undefined);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-state' } });
  });
});

describe('the state sent to the page', () => {
  it('has no session folder, and fits the contract', () => {
    const state = toBridgeSnapshot(snapshot);
    expect(state).not.toHaveProperty('folder');
    expect(contract['recording:snapshot'].output.safeParse(state).success).toBe(true);
    expect(JSON.stringify(state)).not.toContain('Recordings');
  });

  it('is what recording:snapshot returns', () => {
    const { handlers } = setup();
    expect(handlers['recording:snapshot'](undefined)).toEqual(toBridgeSnapshot(snapshot));
  });

  it('keeps the free space of a disk warning and nothing else extra', () => {
    const state = toBridgeSnapshot({
      ...snapshot,
      warnings: [
        { code: 'disk-low', message: 'The disk is nearly full.', freeBytes: 123 },
        { code: 'camera-lost', message: 'The camera stopped.' },
      ],
    });
    expect(state.warnings).toEqual([
      { code: 'disk-low', message: 'The disk is nearly full.', freeBytes: 123 },
      { code: 'camera-lost', message: 'The camera stopped.' },
    ]);
  });
});

describe('recoverable recordings', () => {
  const offered = [
    { folder: 'C:\\Recordings\\one', name: 'one', createdAt: '2026-10-28T10:00:00Z', bytes: 10 },
    { folder: 'C:\\Recordings\\two', name: 'two', createdAt: '2026-10-28T11:00:00Z', bytes: 20 },
  ];
  const make = () =>
    setup(null, fakeRecording({ listRecoverable: () => Promise.resolve(offered) }));

  it('lists what the engine found', async () => {
    const { handlers } = make();
    const list = await handlers['recording:list-recoverable'](undefined);
    expect(list).toEqual(offered);
    expect(contract['recording:list-recoverable'].output.safeParse(list).success).toBe(true);
  });

  it('recovers a folder that was offered', async () => {
    const { handlers, recording } = make();
    await handlers['recording:list-recoverable'](undefined);
    const result = await handlers['recording:recover']({ folder: 'C:\\Recordings\\one' });
    expect(recording.recover).toHaveBeenCalledWith('C:\\Recordings\\one');
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses to recover or dismiss any folder that was not offered', async () => {
    const { handlers, recording } = make();
    await handlers['recording:list-recoverable'](undefined);
    await expect(handlers['recording:recover']({ folder: 'C:\\Windows' })).rejects.toThrow();
    await expect(handlers['recording:dismiss']({ folder: 'C:\\Windows' })).rejects.toThrow();
    expect(recording.recover).not.toHaveBeenCalled();
    expect(recording.dismiss).not.toHaveBeenCalled();
  });

  it('refuses everything before the list was ever asked for', async () => {
    const { handlers } = make();
    await expect(
      handlers['recording:recover']({ folder: 'C:\\Recordings\\one' }),
    ).rejects.toThrow();
  });

  it('forgets a folder once it was recovered or dismissed', async () => {
    const { handlers } = make();
    await handlers['recording:list-recoverable'](undefined);
    await handlers['recording:dismiss']({ folder: 'C:\\Recordings\\one' });
    await expect(
      handlers['recording:dismiss']({ folder: 'C:\\Recordings\\one' }),
    ).rejects.toThrow();
    await handlers['recording:recover']({ folder: 'C:\\Recordings\\two' });
    await expect(
      handlers['recording:recover']({ folder: 'C:\\Recordings\\two' }),
    ).rejects.toThrow();
  });

  it('only offers what the newest list holds', async () => {
    let current = offered;
    const { handlers } = setup(
      null,
      fakeRecording({ listRecoverable: () => Promise.resolve(current) }),
    );
    await handlers['recording:list-recoverable'](undefined);
    current = [offered[1] ?? offered[0]!];
    await handlers['recording:list-recoverable'](undefined);
    await expect(
      handlers['recording:dismiss']({ folder: 'C:\\Recordings\\one' }),
    ).rejects.toThrow();
  });

  it('leaves a failed recovery offered, so the person can try again', async () => {
    const { handlers, recording } = setup(
      null,
      fakeRecording({
        listRecoverable: () => Promise.resolve(offered),
        recover: vi.fn(() => Promise.resolve({ ok: false as const, error })),
      }),
    );
    await handlers['recording:list-recoverable'](undefined);
    const first = await handlers['recording:recover']({ folder: 'C:\\Recordings\\one' });
    expect(first).toMatchObject({ ok: false });
    await handlers['recording:recover']({ folder: 'C:\\Recordings\\one' });
    expect(recording.recover).toHaveBeenCalledTimes(2);
  });
});

describe('engine events as bridge events', () => {
  it('maps each kind to its channel, and every payload fits its contract', () => {
    const cases = [
      toBridgeEvent({ type: 'state', snapshot }),
      toBridgeEvent({
        type: 'warning',
        warning: { code: 'mic-lost', message: 'The microphone stopped.' },
      }),
      toBridgeEvent({ type: 'error', error }),
      toBridgeEvent({ type: 'finished', result: finished }),
    ];
    expect(cases.map((mapped) => mapped.channel)).toEqual([
      'recording:state',
      'recording:warning',
      'recording:error',
      'recording:finished',
    ]);
    for (const mapped of cases) {
      expect(events[mapped.channel].safeParse(mapped.payload).success).toBe(true);
    }
  });

  it('strips the detail from an error event', () => {
    const mapped = toBridgeEvent({ type: 'error', error });
    expect(JSON.stringify(mapped)).not.toMatch(/zainab|ENOSPC|detail/);
  });
});
