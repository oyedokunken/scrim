import type { UpdateBlock, UpdateSnapshot } from '../../../shared/updates-contract';
import { Button, Dialog } from '../../ui';
import { formatBytes } from '../format';
import './updates.css';

const BLOCK_TEXT: Readonly<Record<UpdateBlock, string>> = {
  recording: 'Updates wait until the recording is finished.',
  exporting: 'Updates wait until the export is finished.',
  editing: 'Updates wait until you leave the editor.',
};

export function blockText(blocked: UpdateBlock | null): string {
  return blocked === null ? '' : BLOCK_TEXT[blocked];
}

export interface UpdateModalProps {
  open: boolean;
  snapshot: UpdateSnapshot;
  onClose: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

/**
 * The window that opens from the "New update available" pill: the new version, its notes and size,
 * then Update now or Later. Update now downloads with a progress bar and then asks for the restart.
 * The notes are plain text.
 */
export function UpdateModal({ open, snapshot, onClose, onDownload, onInstall }: UpdateModalProps) {
  const state = snapshot.state;
  const info =
    state.phase === 'available' ||
    state.phase === 'downloading' ||
    state.phase === 'ready' ||
    (state.phase === 'error' && state.info !== undefined)
      ? state.info
      : undefined;
  const blocked = blockText(snapshot.blocked);

  return (
    <Dialog open={open} title="New update available" onClose={onClose} className="update-modal">
      {info === undefined ? (
        <p className="ui-help">No update is waiting.</p>
      ) : (
        <div className="update-body">
          <p className="update-version">
            Version {info.version}
            {info.sizeBytes === null ? '' : `, about ${formatBytes(info.sizeBytes)}`}
          </p>
          {info.notes === '' ? null : (
            <div className="update-notes" tabIndex={0} aria-label="Release notes">
              {info.notes}
            </div>
          )}

          {state.phase === 'downloading' ? (
            <div className="update-progress">
              <div
                className="update-bar"
                role="progressbar"
                aria-label="Download progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.percent}
              >
                <div className="update-bar-fill" style={{ width: `${String(state.percent)}%` }} />
              </div>
              <p className="ui-help" role="status">
                Downloading, {String(state.percent)}%. You can close this and keep working.
              </p>
            </div>
          ) : null}

          {state.phase === 'ready' ? (
            <p className="update-ready" role="status">
              The update is downloaded. Restart to install it. Anything you are working on should be
              saved first.
            </p>
          ) : null}

          {state.phase === 'error' ? (
            <p className="update-error" role="alert">
              {state.message} {state.nextStep}
            </p>
          ) : null}

          {blocked === '' ? null : (
            <p className="ui-help" role="status">
              {blocked}
            </p>
          )}

          <div className="update-actions">
            {state.phase === 'ready' ? (
              <Button
                data-autofocus
                variant="primary"
                disabled={snapshot.blocked !== null}
                onClick={onInstall}
              >
                Restart and install
              </Button>
            ) : (
              <Button
                data-autofocus
                variant="primary"
                disabled={state.phase === 'downloading' || snapshot.blocked !== null}
                onClick={onDownload}
              >
                {state.phase === 'error' ? 'Try again' : 'Update now'}
              </Button>
            )}
            <Button onClick={onClose}>Later</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
