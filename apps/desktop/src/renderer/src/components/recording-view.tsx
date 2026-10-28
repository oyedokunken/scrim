import { BrandMark } from '../brand-mark';
import { formatTimer } from '../format';
import type { Snapshot, UserError } from '../hooks';
import { ErrorNotice } from './error-notice';

export interface RecordingViewProps {
  snapshot: Snapshot;
  busy: boolean;
  error: UserError | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/** What the main window shows if it is brought forward while a recording is running. */
export function RecordingView({
  snapshot,
  busy,
  error,
  onPause,
  onResume,
  onStop,
}: RecordingViewProps) {
  const paused = snapshot.phase === 'paused';
  const saving = snapshot.phase === 'stopping';
  const working = busy || saving;

  return (
    <div className="screen recording">
      <h1 className="brand">
        <BrandMark />
        Scrim
      </h1>
      {error === null ? null : <ErrorNotice error={error} />}
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
        <button
          type="button"
          className="button secondary"
          disabled={working}
          onClick={paused ? onResume : onPause}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="button primary" disabled={working} onClick={onStop}>
          Stop and save
        </button>
      </div>
    </div>
  );
}
