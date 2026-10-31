import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../ui';
import { ReviewScreen, type ReviewScreenProps } from '../review/review-screen';
import { SHORTCUTS } from './shortcuts';
import { Stage } from './stage';

export interface RecordViewProps {
  busy: boolean;
  onStart: () => void;
  /** The recording that was just stopped. It replaces the start screen until the person is done. */
  review?: ReviewScreenProps | undefined;
  /** Camera, microphone and folder, shown under the start screen and never beside a review. */
  controls?: ReactNode;
}

/** One view: start a recording, or review the one that just ended. Nothing else sits beside it. */
export function RecordView({ busy, onStart, review, controls }: RecordViewProps) {
  return (
    <div className="record-view">
      {review === undefined ? (
        <>
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
          {controls === undefined ? null : <div className="record-controls">{controls}</div>}
        </>
      ) : (
        <ReviewScreen {...review} />
      )}
    </div>
  );
}
