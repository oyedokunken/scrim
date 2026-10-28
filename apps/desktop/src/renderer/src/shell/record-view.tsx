import { Monitor } from 'lucide-react';
import { Button } from '../../ui';
import { ErrorNotice } from '../components/error-notice';
import type { UserError } from '../hooks';
import { SHORTCUTS } from './shortcuts';
import { Stage } from './stage';

export interface RecordViewProps {
  busy: boolean;
  error: UserError | null;
  onStart: () => void;
}

/** The stage shows what will be captured and holds the one big button. Cursor and zoom come after, in the editor. */
export function RecordView({ busy, error, onStart }: RecordViewProps) {
  return (
    <div className="record-view">
      <Stage
        icon={<Monitor size={48} strokeWidth={1.5} />}
        label="Record your screen"
        text="Your screen is ready to record"
        shortcut={SHORTCUTS.record.keys}
        action={
          <Button variant="primary" className="record-button" disabled={busy} onClick={onStart}>
            <span className="record-dot" aria-hidden="true" />
            {busy ? 'Starting...' : 'Start recording'}
          </Button>
        }
      />

      {error === null ? null : <ErrorNotice error={error} />}

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title" className="ui-section-title">
          Recent recordings
        </h2>
        <p className="ui-help">No recordings yet. Your first one will show up here.</p>
      </section>
    </div>
  );
}
