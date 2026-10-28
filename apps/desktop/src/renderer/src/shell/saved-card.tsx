import { FolderOpen, Pencil, Video } from 'lucide-react';
import { Button } from '../../ui';
import { formatBytes, formatTimer } from '../format';
import type { Finished } from '../hooks';

export interface SavedCardProps {
  finished: Finished;
  /** Opens the editor on this recording. Left out while there is no editor, and the button is too. */
  onOpenEditor?: () => void;
  onShowInFolder: () => void;
  onRecordAgain: () => void;
}

/**
 * What was just recorded, on the Record view only. It is the way into the editor, and a recording is
 * never a dead end: the folder and a new recording are one click away.
 */
export function SavedCard({
  finished,
  onOpenEditor,
  onShowInFolder,
  onRecordAgain,
}: SavedCardProps) {
  return (
    <section className="saved-card" aria-labelledby="saved-title">
      <span className="saved-card-icon" aria-hidden="true">
        <Video size={20} strokeWidth={1.75} />
      </span>
      <div className="saved-card-text">
        <h2 id="saved-title" className="saved-card-title">
          {finished.recovered ? 'Recording recovered' : 'Recording saved'}
        </h2>
        <p className="saved-card-meta">
          {finished.name}, {formatTimer(finished.durationMs)}, {formatBytes(finished.bytes)}
        </p>
        {finished.warnings.map((warning) => (
          <p key={warning} className="ui-help">
            {warning}
          </p>
        ))}
      </div>
      <div className="saved-card-actions">
        {onOpenEditor === undefined ? null : (
          <Button
            variant="primary"
            icon={<Pencil size={16} strokeWidth={1.75} />}
            onClick={onOpenEditor}
          >
            Open in editor
          </Button>
        )}
        <Button icon={<FolderOpen size={16} strokeWidth={1.75} />} onClick={onShowInFolder}>
          Show in folder
        </Button>
        <Button onClick={onRecordAgain}>Record again</Button>
      </div>
    </section>
  );
}
