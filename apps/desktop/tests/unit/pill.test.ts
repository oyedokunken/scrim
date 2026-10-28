import { describe, expect, it } from 'vitest';
import { formatPillTime } from '../../src/recorder/pill/format';
import { pillActionSchema, type PillState } from '../../src/recorder/pill/protocol';
import { createPillController, pillPhaseOf } from '../../src/main/recording/pill-controller';
import {
  PILL_MARGIN,
  PILL_SIZE,
  defaultPillPosition,
  isOnScreen,
  pillPositionSchema,
  resolvePillPosition,
} from '../../src/main/recording/pill-position';
import type { FinishedRecording, Outcome, RecordingSnapshot } from '../../src/main/recording/types';

const area = { x: 0, y: 0, width: 1920, height: 1040 };

describe('pill size and position', () => {
  it('is compact, about 200 by 40', () => {
    expect(PILL_SIZE.width).toBeGreaterThanOrEqual(190);
    expect(PILL_SIZE.width).toBeLessThanOrEqual(240);
    expect(PILL_SIZE.height).toBeLessThanOrEqual(44);
  });

  it('starts at the bottom left, 24 pixels from the edges', () => {
    expect(defaultPillPosition(area)).toEqual({
      x: PILL_MARGIN,
      y: 1040 - PILL_MARGIN - PILL_SIZE.height,
    });
    expect(defaultPillPosition({ x: 1920, y: 40, width: 1280, height: 720 })).toEqual({
      x: 1920 + PILL_MARGIN,
      y: 40 + 720 - PILL_MARGIN - PILL_SIZE.height,
    });
  });

  it('moves to a free corner when the recorded region covers the bottom left', () => {
    const covering = { x: 0, y: 700, width: 600, height: 340 };
    const position = defaultPillPosition(area, covering);
    expect(position.x).toBe(1920 - PILL_MARGIN - PILL_SIZE.width);
    expect(position.y).toBe(1040 - PILL_MARGIN - PILL_SIZE.height);
  });

  it('keeps the bottom left when every corner is covered', () => {
    expect(defaultPillPosition(area, area)).toEqual(defaultPillPosition(area));
  });

  it('knows whether the whole pill is on a display', () => {
    expect(isOnScreen({ x: 10, y: 10 }, [area])).toBe(true);
    expect(isOnScreen({ x: 1900, y: 10 }, [area])).toBe(false);
    expect(isOnScreen({ x: 10, y: 10 }, [])).toBe(false);
  });

  it('uses the remembered spot only while a display still shows it', () => {
    const saved = { x: 300, y: 200 };
    expect(resolvePillPosition({ saved, workArea: area, workAreas: [area] })).toEqual(saved);
    expect(
      resolvePillPosition({ saved: { x: 5000, y: 0 }, workArea: area, workAreas: [area] }),
    ).toEqual(defaultPillPosition(area));
    expect(resolvePillPosition({ saved: undefined, workArea: area, workAreas: [area] })).toEqual(
      defaultPillPosition(area),
    );
  });

  it('accepts only whole numbers in a saved position', () => {
    expect(pillPositionSchema.safeParse({ x: 1, y: 2 }).success).toBe(true);
    expect(pillPositionSchema.safeParse({ x: 1.5, y: 2 }).success).toBe(false);
    expect(pillPositionSchema.safeParse({ x: 1, y: 2, z: 3 }).success).toBe(false);
    expect(pillPositionSchema.safeParse('x').success).toBe(false);
  });
});

describe('pill page contract', () => {
  it('formats the timer', () => {
    expect(formatPillTime(0)).toBe('00:00');
    expect(formatPillTime(59_999)).toBe('00:59');
    expect(formatPillTime(61_000)).toBe('01:01');
    expect(formatPillTime(3_725_000)).toBe('1:02:05');
    expect(formatPillTime(-5)).toBe('00:00');
  });

  it('accepts only the five known actions and nothing extra', () => {
    for (const type of ['ready', 'pause', 'resume', 'stop', 'discard']) {
      expect(pillActionSchema.safeParse({ type }).success).toBe(true);
    }
    expect(pillActionSchema.safeParse({ type: 'quit' }).success).toBe(false);
    expect(pillActionSchema.safeParse({ type: 'discard', folder: 'C:/x' }).success).toBe(false);
    expect(pillActionSchema.safeParse('stop').success).toBe(false);
  });
});

function snapshot(phase: RecordingSnapshot['phase'], elapsedMs = 0): RecordingSnapshot {
  return { phase, elapsedMs, bytesWritten: 0, tracks: [], warnings: [] };
}

const finished: FinishedRecording = {
  folder: 'C:/rec/one',
  name: 'one',
  files: [],
  durationMs: 1000,
  bytes: 10,
  recovered: false,
  warnings: [],
};

function setup(initial: RecordingSnapshot['phase'] = 'recording') {
  let current = snapshot(initial, 4200);
  const calls: string[] = [];
  const sent: PillState[] = [];
  const logs: string[] = [];
  let stopResult: Outcome<FinishedRecording> = { ok: true, value: finished };
  const controller = createPillController({
    service: {
      pause: () => {
        calls.push('pause');
        current = snapshot('paused', 4200);
        return Promise.resolve({ ok: true, value: undefined });
      },
      resume: () => {
        calls.push('resume');
        current = snapshot('recording', 4200);
        return Promise.resolve({ ok: true, value: undefined });
      },
      stop: () => {
        calls.push('stop');
        current = snapshot('stopped');
        return Promise.resolve(stopResult);
      },
      snapshot: () => current,
    },
    window: {
      open: () => calls.push('open'),
      close: () => calls.push('close'),
      send: (state) => sent.push(state),
    },
    trash: (folder) => {
      calls.push(`trash ${folder}`);
      return Promise.resolve();
    },
    log: (message) => logs.push(message),
  });
  return {
    controller,
    calls,
    sent,
    logs,
    set: (phase: RecordingSnapshot['phase']) => {
      current = snapshot(phase, 4200);
    },
    failStop: () => {
      stopResult = {
        ok: false,
        error: { code: 'remux-failed', message: 'm', nextStep: 'n' },
      };
    },
  };
}

describe('pillPhaseOf', () => {
  it('maps the engine phases the pill cares about', () => {
    expect(pillPhaseOf('starting')).toBe('recording');
    expect(pillPhaseOf('recording')).toBe('recording');
    expect(pillPhaseOf('paused')).toBe('paused');
    expect(pillPhaseOf('stopping')).toBe('saving');
    expect(pillPhaseOf('idle')).toBeUndefined();
    expect(pillPhaseOf('stopped')).toBeUndefined();
    expect(pillPhaseOf('failed')).toBeUndefined();
  });
});

describe('createPillController', () => {
  it('opens and shows the time when a state arrives while recording', () => {
    const { controller, calls, sent } = setup();
    controller.onEvent({ type: 'state', snapshot: snapshot('recording', 4200) });
    expect(calls).toEqual(['open']);
    expect(sent).toEqual([{ phase: 'recording', elapsedMs: 4200, busy: false }]);
  });

  it('closes when the recording is no longer live, for any reason', () => {
    const { controller, calls, set } = setup();
    set('failed');
    controller.onEvent({ type: 'state', snapshot: snapshot('failed') });
    controller.onEvent({ type: 'finished', result: finished });
    controller.onEvent({
      type: 'error',
      error: { code: 'disk-full', message: 'm', nextStep: 'n' },
    });
    expect(calls).toEqual(['close', 'close', 'close']);
  });

  it('pauses and resumes through the service and shows the new phase each time', async () => {
    const { controller, calls, sent } = setup();
    await controller.handle({ type: 'pause' });
    expect(calls).toContain('pause');
    expect(sent.at(-1)).toEqual({ phase: 'paused', elapsedMs: 4200, busy: false });
    await controller.handle({ type: 'resume' });
    expect(calls).toContain('resume');
    expect(sent.at(-1)).toEqual({ phase: 'recording', elapsedMs: 4200, busy: false });
    expect(sent.some((state) => state.busy)).toBe(true);
  });

  it('stops through the service and always closes the pill', async () => {
    const { controller, calls } = setup();
    await controller.handle({ type: 'stop' });
    expect(calls.filter((call) => call === 'stop')).toHaveLength(1);
    expect(calls).toContain('close');
    expect(calls.some((call) => call.startsWith('trash'))).toBe(false);
  });

  it('closes the pill even when the stop reports a problem', async () => {
    const { controller, calls, logs, failStop } = setup();
    failStop();
    await controller.handle({ type: 'stop' });
    expect(calls).toContain('close');
    expect(logs.join(' ')).toContain('remux-failed');
  });

  it('discards by saving first and then moving the folder to the recycle bin', async () => {
    const { controller, calls } = setup();
    await controller.handle({ type: 'discard' });
    expect(calls.indexOf('stop')).toBeLessThan(calls.indexOf('trash C:/rec/one'));
    expect(calls).toContain('close');
  });

  it('keeps the recording when the stop failed during a discard', async () => {
    const { controller, calls, failStop } = setup();
    failStop();
    await controller.handle({ type: 'discard' });
    expect(calls.some((call) => call.startsWith('trash'))).toBe(false);
  });

  it('ignores a second action while one is running', async () => {
    const { controller, calls } = setup();
    await Promise.all([controller.handle({ type: 'pause' }), controller.handle({ type: 'stop' })]);
    expect(calls).toContain('pause');
    expect(calls).not.toContain('stop');
  });

  it('answers ready with the current state', async () => {
    const { controller, sent } = setup('paused');
    await controller.handle({ type: 'ready' });
    expect(sent).toEqual([{ phase: 'paused', elapsedMs: 4200, busy: false }]);
  });
});
