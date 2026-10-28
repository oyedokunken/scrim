import { describe, expect, it } from 'vitest';
import { createCrashGuard } from '../../src/main/recording/crash-guard';
import { WARNINGS } from '../../src/main/recording/messages';
import type { RecordingService } from '../../src/main/recording/recording-service';
import type { FinishedRecording, Outcome, RecordingSnapshot } from '../../src/main/recording/types';

type Phase = RecordingSnapshot['phase'];

const FINISHED: FinishedRecording = {
  folder: 'f',
  name: 'n',
  files: [],
  durationMs: 0,
  bytes: 0,
  recovered: false,
  warnings: [],
};

function setup(
  phase: Phase,
  stop: RecordingService['stop'] = () =>
    Promise.resolve<Outcome<FinishedRecording>>({ ok: true, value: FINISHED }),
) {
  const logs: string[] = [];
  const notices: { title: string; message: string }[] = [];
  let stops = 0;
  const guard = createCrashGuard({
    service: {
      snapshot: () => ({ phase, elapsedMs: 0, bytesWritten: 0, tracks: [], warnings: [] }),
      stop: () => {
        stops += 1;
        return stop();
      },
    },
    log: (message) => logs.push(message),
    notify: (title, message) => notices.push({ title, message }),
  });
  return { guard, logs, notices, stops: () => stops };
}

describe('createCrashGuard', () => {
  it.each(['recording', 'paused'] as const)(
    'saves a recording that is %s before it tells the person',
    async (phase) => {
      const { guard, notices, stops } = setup(phase);
      await guard.onException(new Error('boom'));
      expect(stops()).toBe(1);
      expect(notices).toHaveLength(1);
      expect(notices[0]?.message).toContain('stopped and saved');
    },
  );

  it('does not stop anything when nothing is recording, and says the app can keep going', async () => {
    const { guard, notices, stops } = setup('idle');
    await guard.onException(new Error('boom'));
    expect(stops()).toBe(0);
    expect(notices[0]?.message).toContain('keep using Scrim');
  });

  it('says the footage is safe, and how to get it back, when the stop did not finish', async () => {
    const failing = () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'remux-failed' as const, message: 'x', nextStep: 'y' },
      });
    const { guard, notices } = setup('recording', failing);
    await guard.onException(new Error('boom'));
    expect(notices[0]?.message).toContain('recover');
  });

  it('copes with a stop that throws', async () => {
    const { guard, notices, logs } = setup('recording', () => Promise.reject(new Error('stuck')));
    await guard.onException(new Error('boom'));
    expect(notices[0]?.message).toContain('kept on disk');
    expect(logs.join(' ')).toContain('stuck');
  });

  it('logs one line with no stack, and handles one error at a time', async () => {
    const { guard, logs, stops } = setup('recording');
    const error = new Error('first line\nsecond line with a path C:\\Users\\someone');
    await Promise.all([guard.onException(error), guard.onException(error)]);
    expect(stops()).toBe(1);
    expect(logs[0]).toBe('Unexpected error: Error: first line');
    expect(logs.join('\n')).not.toContain('someone');
  });

  it('logs an unhandled rejection and does nothing else', () => {
    const { guard, logs, notices, stops } = setup('recording');
    guard.onRejection(new TypeError('late'));
    guard.onRejection('plain text');
    guard.onRejection({ weird: true });
    expect(logs).toEqual([
      'Unhandled promise rejection: TypeError: late',
      'Unhandled promise rejection: plain text',
      'Unhandled promise rejection: unknown error',
    ]);
    expect(notices).toEqual([]);
    expect(stops()).toBe(0);
  });
});

describe('the camera and microphone warnings', () => {
  it.each([
    ['camera', 'permission-denied', 'Windows Settings'],
    ['mic', 'permission-denied', 'Microphone'],
    ['camera', 'device-missing', 'No camera was found'],
    ['mic', 'device-busy', 'Another app is using the microphone'],
    ['camera', 'unsupported', 'cannot record from the camera'],
    ['mic', 'unknown', 'could not be opened'],
  ] as const)('%s with %s explains it plainly', (kind, reason, text) => {
    const warning = WARNINGS.deviceUnavailable(kind, reason);
    expect(warning.message).toContain(text);
    expect(warning.message).toContain('The screen is still being recorded.');
    expect(warning.code).toBe(kind === 'camera' ? 'camera-unavailable' : 'mic-unavailable');
  });
});
