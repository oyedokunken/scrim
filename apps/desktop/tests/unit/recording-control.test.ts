import { describe, expect, it, vi } from 'vitest';
import {
  createRecordingControl,
  isLivePhase,
  type ControllableService,
} from '../../src/main/shell/recording-control';
import type { RecordingEvent, RecordingOptions } from '../../src/main/recording/types';
import { error, finished, snapshot } from './support/recording-api-fake';

const options: RecordingOptions = {
  source: { kind: 'display' },
  camera: { enabled: false },
  mic: { enabled: true, deviceId: 'mic-1' },
};

/** A service whose phase and events the test drives by hand. */
function fakeService(initial: 'idle' | 'recording' = 'idle') {
  let phase: 'idle' | 'recording' | 'paused' | 'stopped' = initial;
  const listeners = new Set<(event: RecordingEvent) => void>();
  const service: ControllableService = {
    on: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => ({ ...snapshot, phase }),
    start: vi.fn(() => Promise.resolve({ ok: true as const, value: { folder: 'C:\\r\\a' } })),
    stop: vi.fn(() => {
      phase = 'stopped';
      return Promise.resolve({ ok: true as const, value: finished });
    }),
  };
  const emit = (next: typeof phase) => {
    phase = next;
    for (const listener of listeners) listener({ type: 'state', snapshot: { ...snapshot, phase } });
  };
  return { service, emit, listeners };
}

describe('isLivePhase', () => {
  it.each([
    ['idle', false],
    ['starting', true],
    ['recording', true],
    ['paused', true],
    ['stopping', true],
    ['stopped', false],
    ['failed', false],
  ] as const)('%s -> %s', (phase, expected) => {
    expect(isLivePhase(phase)).toBe(expected);
  });
});

describe('createRecordingControl', () => {
  it('reports not recording until the service is attached', () => {
    const control = createRecordingControl({ startOptions: () => options });
    expect(control.isRecording()).toBe(false);
  });

  it('follows the service as it starts, pauses and stops', () => {
    const { service, emit } = fakeService();
    const control = createRecordingControl({ startOptions: () => options });
    const seen: boolean[] = [];
    control.onChange((recording) => seen.push(recording));
    control.attach(service);

    emit('recording');
    expect(control.isRecording()).toBe(true);
    emit('paused');
    expect(control.isRecording()).toBe(true);
    emit('stopped');
    expect(control.isRecording()).toBe(false);
    // Each change is announced once. Pausing is still recording, so it adds nothing.
    expect(seen).toEqual([true, false]);
  });

  it('knows about a recording that was already running when it was attached', () => {
    const { service } = fakeService('recording');
    const control = createRecordingControl({ startOptions: () => options });
    control.attach(service);
    expect(control.isRecording()).toBe(true);
  });

  it('starts a recording with the saved choices', async () => {
    const { service } = fakeService();
    const control = createRecordingControl({ startOptions: () => options });
    control.attach(service);
    await control.start();
    expect(service.start).toHaveBeenCalledWith(options);
  });

  it('fails to start when the engine refuses, and says which error', async () => {
    const { service } = fakeService();
    vi.mocked(service.start).mockResolvedValueOnce({ ok: false, error });
    const control = createRecordingControl({ startOptions: () => options });
    control.attach(service);
    await expect(control.start()).rejects.toThrow('disk-full');
  });

  it('cannot start before the service exists', async () => {
    const control = createRecordingControl({ startOptions: () => options });
    await expect(control.start()).rejects.toThrow('not ready');
  });

  it('stops and saves, and then reports not recording', async () => {
    const { service, emit } = fakeService();
    const control = createRecordingControl({ startOptions: () => options });
    control.attach(service);
    emit('recording');
    await control.stopAndSave();
    expect(service.stop).toHaveBeenCalledOnce();
    expect(control.isRecording()).toBe(false);
  });

  it('has nothing to stop before the service exists, and does not fail', async () => {
    const control = createRecordingControl({ startOptions: () => options });
    await expect(control.stopAndSave()).resolves.toBeUndefined();
  });

  it('stops telling a listener once it has unsubscribed', () => {
    const { service, emit } = fakeService();
    const control = createRecordingControl({ startOptions: () => options });
    const listener = vi.fn();
    const off = control.onChange(listener);
    control.attach(service);
    emit('recording');
    off();
    emit('stopped');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('settles on the real phase after a finished or error event', () => {
    const { service, listeners } = fakeService('recording');
    const control = createRecordingControl({ startOptions: () => options });
    control.attach(service);
    expect(control.isRecording()).toBe(true);
    // The engine ended the recording by itself (a disk error), then said so.
    vi.spyOn(service, 'snapshot').mockReturnValue({ ...snapshot, phase: 'failed' });
    for (const listener of listeners) listener({ type: 'error', error });
    expect(control.isRecording()).toBe(false);
  });
});
