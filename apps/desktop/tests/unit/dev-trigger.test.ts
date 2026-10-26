import { describe, expect, it } from 'vitest';
import {
  DEV_PAUSE_SECONDS,
  readDevTrigger,
  runDevTrigger,
  type DevTriggerDeps,
} from '../../src/main/recording/dev-trigger';
import type { FinishedRecording, Outcome, RecordingError } from '../../src/main/recording/types';

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const failure: RecordingError = {
  code: 'screen-permission',
  message: 'No.',
  nextStep: 'Allow it.',
};

describe('readDevTrigger', () => {
  it('is ignored when the app is packaged, whatever the variables say', () => {
    expect(
      readDevTrigger(
        { SCRIM_DEV_RECORD: '10', SCRIM_DEV_RECOVER: '1', SCRIM_DEV_PAUSE: '3' },
        true,
      ),
    ).toBeUndefined();
  });

  it('does nothing without the variable, or with one that is not a sensible number', () => {
    for (const value of [undefined, '', '0', '-5', 'abc', '1.5', '99999', ' 10']) {
      expect(readDevTrigger({ SCRIM_DEV_RECORD: value }, false)).toBeUndefined();
    }
    expect(readDevTrigger({}, false)).toBeUndefined();
  });

  it('reads the seconds and the options', () => {
    expect(
      readDevTrigger(
        {
          SCRIM_DEV_RECORD: '10',
          SCRIM_DEV_CAMERA: '1',
          SCRIM_DEV_MIC: '1',
          SCRIM_DEV_PAUSE: '3',
          SCRIM_DEV_DEST: 'D:\\clips',
        },
        false,
      ),
    ).toEqual({
      mode: 'record',
      seconds: 10,
      camera: true,
      mic: true,
      pauseAt: 3,
      destination: 'D:\\clips',
    });
    expect(readDevTrigger({ SCRIM_DEV_RECORD: '5' }, false)).toEqual({
      mode: 'record',
      seconds: 5,
      camera: false,
      mic: false,
      pauseAt: undefined,
      destination: undefined,
    });
  });

  it('ignores a pause that would not fit inside the recording', () => {
    expect(
      readDevTrigger({ SCRIM_DEV_RECORD: '5', SCRIM_DEV_PAUSE: '5' }, false)?.pauseAt,
    ).toBeUndefined();
    expect(
      readDevTrigger({ SCRIM_DEV_RECORD: '5', SCRIM_DEV_PAUSE: '9' }, false)?.pauseAt,
    ).toBeUndefined();
  });

  it('reads recover mode, which needs no seconds', () => {
    expect(readDevTrigger({ SCRIM_DEV_RECOVER: '1' }, false)?.mode).toBe('recover');
    expect(readDevTrigger({ SCRIM_DEV_RECOVER: '0' }, false)).toBeUndefined();
  });
});

describe('runDevTrigger', () => {
  const finished: FinishedRecording = {
    folder: 'C:\\Videos\\Scrim\\Demo.scrim',
    name: 'Demo',
    files: [{ kind: 'screen', path: 'C:\\Videos\\Scrim\\Demo.scrim\\screen.mp4' }],
    durationMs: 10_000,
    bytes: 1234,
    inputLog: 'C:\\Videos\\Scrim\\Demo.scrim\\Demo.scrim.json',
    recovered: false,
    warnings: [],
  };

  function setup(overrides: Partial<DevTriggerDeps['service']> = {}) {
    const calls: string[] = [];
    const waits: number[] = [];
    const logs: string[] = [];
    let done = 0;
    const deps: DevTriggerDeps = {
      service: {
        start: (options) => {
          calls.push(
            `start:${options.camera.enabled ? 'camera' : ''}:${options.mic.enabled ? 'mic' : ''}`,
          );
          return Promise.resolve(ok({ folder: finished.folder }));
        },
        pause: () => {
          calls.push('pause');
          return Promise.resolve(ok(undefined));
        },
        resume: () => {
          calls.push('resume');
          return Promise.resolve(ok(undefined));
        },
        stop: () => {
          calls.push('stop');
          return Promise.resolve(ok(finished));
        },
        listRecoverable: () =>
          Promise.resolve([{ folder: 'f1', name: 'One', createdAt: '', bytes: 1 }]),
        recover: (folder) => {
          calls.push(`recover:${folder}`);
          return Promise.resolve(ok({ ...finished, recovered: true }));
        },
        ...overrides,
      },
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      log: (message) => logs.push(message),
      done: () => {
        done += 1;
      },
    };
    return { deps, calls, waits, logs, done: () => done };
  }

  it('records for the given time and logs where everything landed', async () => {
    const { deps, calls, waits, logs, done } = setup();
    await runDevTrigger(
      {
        mode: 'record',
        seconds: 10,
        camera: false,
        mic: true,
        pauseAt: undefined,
        destination: undefined,
      },
      deps,
    );
    expect(calls).toEqual(['start::mic', 'stop']);
    expect(waits).toEqual([10_000]);
    expect(logs[0]).toContain(finished.folder);
    expect(logs.at(-1)).toContain('screen.mp4');
    expect(logs.at(-1)).toContain('10 s');
    expect(done()).toBe(1);
  });

  it('pauses at the time asked for two seconds, then resumes and records the rest', async () => {
    const { deps, calls, waits } = setup();
    await runDevTrigger(
      { mode: 'record', seconds: 10, camera: true, mic: false, pauseAt: 3, destination: undefined },
      deps,
    );
    expect(calls).toEqual(['start:camera:', 'pause', 'resume', 'stop']);
    expect(waits).toEqual([3000, DEV_PAUSE_SECONDS * 1000, 7000]);
  });

  it.each(['start', 'pause', 'resume', 'stop'] as const)(
    'reports a failed %s and still finishes',
    async (step) => {
      const bad = () => Promise.resolve<Outcome<never>>({ ok: false, error: failure });
      const { deps, logs, done } = setup({ [step]: bad });
      await runDevTrigger(
        {
          mode: 'record',
          seconds: 6,
          camera: false,
          mic: false,
          pauseAt: 2,
          destination: undefined,
        },
        deps,
      );
      expect(logs.join('\n')).toContain(`DEV RECORD ${step} failed`);
      expect(logs.join('\n')).toContain('screen-permission');
      expect(done()).toBe(1);
    },
  );

  it('recovers every unfinished recording in recover mode', async () => {
    const { deps, calls, logs, done } = setup();
    await runDevTrigger(
      {
        mode: 'recover',
        seconds: 0,
        camera: false,
        mic: false,
        pauseAt: undefined,
        destination: undefined,
      },
      deps,
    );
    expect(calls).toEqual(['recover:f1']);
    expect(logs[0]).toContain('found 1');
    expect(logs[1]).toContain('DEV RECOVER finished');
    expect(done()).toBe(1);
  });

  it('reports a recovery that fails', async () => {
    const { deps, logs } = setup({
      recover: () => Promise.resolve<Outcome<never>>({ ok: false, error: failure }),
    });
    await runDevTrigger(
      {
        mode: 'recover',
        seconds: 0,
        camera: false,
        mic: false,
        pauseAt: undefined,
        destination: undefined,
      },
      deps,
    );
    expect(logs.join('\n')).toContain('DEV RECOVER failed');
  });
});
