import { Monitor } from 'lucide-react';
import { Button, Keycaps } from '../../ui';
import { ErrorNotice } from '../components/error-notice';
import type { UserError } from '../hooks';
import { SHORTCUTS } from './shortcuts';

export interface RecordViewProps {
  busy: boolean;
  error: UserError | null;
  onStart: () => void;
}

/** The stage shows what will be captured, then the one big button. Cursor and zoom come after, in the editor. */
export function RecordView({ busy, error, onStart }: RecordViewProps) {
  return (
    <div className="record-view">
      <div className="stage" role="img" aria-label="Your screen will be recorded">
        <Monitor size={48} strokeWidth={1.5} aria-hidden="true" />
        <p className="stage-text">Your screen is ready to record</p>
      </div>

      {error === null ? null : <ErrorNotice error={error} />}

      <div className="record-actions">
        <Button variant="primary" className="record-button" disabled={busy} onClick={onStart}>
          <span className="record-dot" aria-hidden="true" />
          {busy ? 'Starting...' : 'Start recording'}
        </Button>
        <Keycaps keys={SHORTCUTS.record.keys} />
      </div>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title" className="ui-section-title">
          Recent recordings
        </h2>
        <p className="ui-help">No recordings yet. Your first one will show up here.</p>
      </section>
    </div>
  );
}
