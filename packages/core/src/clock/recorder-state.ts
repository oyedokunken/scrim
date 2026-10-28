import { err, ok, type Result } from '../result';

/** Where a recording is in its life. `stopped` and `failed` are final until a reset. */
export type RecorderPhase =
  'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'failed';

export type RecorderEvent =
  'start' | 'started' | 'pause' | 'resume' | 'stop' | 'stopped' | 'fail' | 'reset';

export interface TransitionError {
  code: 'invalid-transition';
  from: RecorderPhase;
  event: RecorderEvent;
}

const TRANSITIONS: Readonly<Record<RecorderPhase, Partial<Record<RecorderEvent, RecorderPhase>>>> =
  {
    idle: { start: 'starting' },
    starting: { started: 'recording', fail: 'failed' },
    recording: { pause: 'paused', stop: 'stopping', fail: 'failed' },
    paused: { resume: 'recording', stop: 'stopping', fail: 'failed' },
    stopping: { stopped: 'stopped', fail: 'failed' },
    stopped: { reset: 'idle' },
    failed: { reset: 'idle' },
  };

/** The reducer for the recorder phase. An event that makes no sense now is an error value. */
export function nextPhase(
  from: RecorderPhase,
  event: RecorderEvent,
): Result<RecorderPhase, TransitionError> {
  const to = TRANSITIONS[from][event];
  return to === undefined ? err({ code: 'invalid-transition', from, event }) : ok(to);
}

/** Phases in which footage is being, or may still be, written. */
export function isActive(phase: RecorderPhase): boolean {
  return (
    phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'stopping'
  );
}
