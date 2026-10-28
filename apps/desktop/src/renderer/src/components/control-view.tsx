import { formatTimer } from '../format';
import type { Snapshot } from '../hooks';

export interface ControlViewProps {
  snapshot: Snapshot;
  /** True while a pause, resume or stop is in flight, so a button cannot be pressed twice. */
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * The small bar over the screen while recording: a red dot, the time, and Pause or Resume and Stop.
 * It is the whole window, drawn as a pill on a transparent window.
 */
export function ControlView({ snapshot, busy, onPause, onResume, onStop }: ControlViewProps) {
  const paused = snapshot.phase === 'paused';
  const saving = snapshot.phase === 'stopping';
  const working = busy || saving || snapshot.phase === 'starting';

  return (
    <div className="control" role="group" aria-label="Recording controls">
      <span className={paused ? 'rec-dot paused' : 'rec-dot'} aria-hidden="true" />
      <span className="control-state">{saving ? 'Saving' : paused ? 'Paused' : 'REC'}</span>
      <span className="control-time" role="timer" aria-label="Recorded time">
        {formatTimer(snapshot.elapsedMs)}
      </span>
      <button
        type="button"
        className="button control-button"
        disabled={working}
        onClick={paused ? onResume : onPause}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        className="button control-button stop"
        disabled={working}
        onClick={onStop}
      >
        Stop
      </button>
    </div>
  );
}
