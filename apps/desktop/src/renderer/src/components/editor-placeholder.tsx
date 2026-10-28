import { BrandMark } from '../brand-mark';
import { formatBytes, formatTimer } from '../format';
import type { Finished } from '../hooks';

export interface EditorPlaceholderProps {
  finished: Finished;
  onShowInFolder: () => void;
  onRecordAgain: () => void;
}

/**
 * Where the editor opens after a recording. Until the editor screen is wired in, this shows what was
 * saved and lets the person open the folder or record again, so a recording is never a dead end.
 */
export function EditorPlaceholder({
  finished,
  onShowInFolder,
  onRecordAgain,
}: EditorPlaceholderProps) {
  return (
    <main className="screen editor-placeholder">
      <h1 className="brand">
        <BrandMark />
        Scrim
      </h1>
      <section className="panel" aria-labelledby="saved-title">
        <h2 id="saved-title">{finished.recovered ? 'Recording recovered' : 'Recording saved'}</h2>
        <p className="saved-name">{finished.name}</p>
        <dl className="summary">
          <div>
            <dt>Length</dt>
            <dd>{formatTimer(finished.durationMs)}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatBytes(finished.bytes)}</dd>
          </div>
          <div>
            <dt>Tracks</dt>
            <dd>{finished.files.map((file) => file.kind).join(', ')}</dd>
          </div>
        </dl>
        {finished.warnings.map((warning) => (
          <p key={warning} className="hint">
            {warning}
          </p>
        ))}
      </section>
      <div className="actions row">
        <button type="button" className="button secondary" onClick={onShowInFolder}>
          Show in folder
        </button>
        <button type="button" className="button primary" onClick={onRecordAgain}>
          Record again
        </button>
      </div>
    </main>
  );
}
