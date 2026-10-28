import type { RecorderPhase } from '@scrim/core';
import { describe, expect, it, vi } from 'vitest';
import type { RecordingEvent } from '../../src/main/recording/types';
import {
  createRecordingWindows,
  windowActions,
  type WindowAction,
} from '../../src/main/shell/recording-windows';
import { error, finished, snapshot } from './support/recording-api-fake';

describe('windowActions', () => {
  it.each<[RecorderPhase, RecorderPhase, WindowAction[]]>([
    ['idle', 'starting', ['hide-main', 'show-control']],
    ['idle', 'recording', ['hide-main', 'show-control']],
    ['stopped', 'starting', ['hide-main', 'show-control']],
    ['failed', 'starting', ['hide-main', 'show-control']],
    ['starting', 'recording', []],
    ['recording', 'paused', []],
    ['paused', 'recording', []],
    ['recording', 'stopping', []],
    ['recording', 'stopped', ['close-control', 'show-main']],
    ['stopping', 'stopped', ['close-control', 'show-main']],
    ['paused', 'stopped', ['close-control', 'show-main']],
    ['starting', 'failed', ['close-control', 'show-main']],
    ['recording', 'failed', ['close-control', 'show-main']],
    ['idle', 'idle', []],
    ['stopped', 'idle', []],
    ['failed', 'stopped', []],
  ])('%s to %s', (previous, next, expected) => {
    expect(windowActions(previous, next)).toEqual(expected);
  });
});

const state = (phase: RecorderPhase): RecordingEvent => ({
  type: 'state',
  snapshot: { ...snapshot, phase },
});

function effects() {
  const calls: string[] = [];
  return {
    calls,
    effects: {
      hideMain: vi.fn(() => calls.push('hideMain')),
      showControl: vi.fn(() => calls.push('showControl')),
      closeControl: vi.fn(() => calls.push('closeControl')),
      showMain: vi.fn(() => calls.push('showMain')),
    },
  };
}

describe('createRecordingWindows', () => {
  it('swaps the windows when a recording starts and again when it ends', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    for (const phase of [
      'starting',
      'recording',
      'paused',
      'recording',
      'stopping',
      'stopped',
    ] as const) {
      windows.onEvent(state(phase));
    }
    expect(calls).toEqual(['hideMain', 'showControl', 'closeControl', 'showMain']);
  });

  it('brings the main window back with the result when a recording finishes', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    windows.onEvent(state('recording'));
    windows.onEvent({ type: 'finished', result: finished });
    expect(calls).toEqual(['hideMain', 'showControl', 'closeControl', 'showMain']);
  });

  it('brings the main window back to explain a failure the person did not cause', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    windows.onEvent(state('recording'));
    windows.onEvent({ type: 'error', error });
    expect(calls).toEqual(['hideMain', 'showControl', 'closeControl', 'showMain']);
  });

  it('is safe when a finished event follows the stopped state, which closes and shows twice', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    windows.onEvent(state('recording'));
    windows.onEvent(state('stopped'));
    windows.onEvent({ type: 'finished', result: finished });
    // The effects are idempotent, so the repeat does no harm. It only has to end in the right place.
    expect(calls.slice(-2)).toEqual(['closeControl', 'showMain']);
  });

  it('does nothing for a warning', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    windows.onEvent({
      type: 'warning',
      warning: { code: 'camera-lost', message: 'The camera stopped.' },
    });
    expect(calls).toEqual([]);
  });

  it('starts the next recording cleanly after one that failed', () => {
    const { calls, effects: fx } = effects();
    const windows = createRecordingWindows(fx);
    windows.onEvent(state('starting'));
    windows.onEvent(state('failed'));
    windows.onEvent(state('starting'));
    expect(calls).toEqual([
      'hideMain',
      'showControl',
      'closeControl',
      'showMain',
      'hideMain',
      'showControl',
    ]);
  });
});
