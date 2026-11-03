import { BrandMark } from '../brand-mark';
import { Button } from '../../ui';
import { formatTimer } from '../format';

const WORKING_REASON = 'Scrim is still starting or saving. Try again in a moment.';
import type { Snapshot } from '../hooks';

export interface RecordingViewProps {
  snapshot: Snapshot;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/** What the main window shows if it is brought forward while a recording is running. */
export function RecordingView({ snapshot, busy, onPause, onResume, onStop }: RecordingViewProps) {
  const paused = snapshot.phase === 'paused';
  const saving = snapshot.phase === 'stopping';
  const working = busy || saving;

  return (
    <div className="screen recording">
      <h1 className="brand">
        <BrandMark />
        Scrim
      </h1>
      <div className="panel recording-status" role="status">
        <p className="recording-phase">
          <span className={paused ? 'rec-dot paused' : 'rec-dot'} aria-hidden="true" />
          {saving ? 'Saving your recording' : paused ? 'Recording is paused' : 'Recording'}
        </p>
        <p className="recording-time">{formatTimer(snapshot.elapsedMs)}</p>
        {snapshot.warnings.map((warning) => (
          <p key={`${warning.code}-${warning.message}`} className="hint">
            {warning.message}
          </p>
        ))}
      </div>
      <div className="actions row">
        <Button
          bare
          className="button secondary"
          disabled={working}
          disabledReason={WORKING_REASON}
          onClick={paused ? onResume : onPause}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          bare
          className="button primary"
          disabled={working}
          disabledReason={WORKING_REASON}
          onClick={onStop}
        >
          Stop and save
        </Button>
      </div>
    </div>
  );
}
