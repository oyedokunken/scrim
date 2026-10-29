import { FolderOpen, Pencil, Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../ui';
import { formatBytes, formatTimer } from '../format';
import type { ExportJobView, Finished } from '../hooks';

export interface SavedCardProps {
  finished: Finished;
  /** The export of this recording, from the moment it was queued. Null before the first status arrives. */
  job?: ExportJobView | null;
  /** Opens the editor on this recording. Left out while there is no editor, and the button is too. */
  onOpenEditor?: () => void;
  /** Shows the working folder, for a recording whose video does not exist yet. */
  onShowInFolder: () => void;
  onRecordAgain: () => void;
  onCancelExport?: (jobId: string) => void;
  onRetrySafer?: (jobId: string) => void;
  /** Shows the finished video, or the recording's own folder, in the file manager. */
  onReveal?: (jobId: string, what: 'output' | 'source') => void;
  /** Makes the video again after a cancel. */
  onExportAgain?: () => void;
}

/** A thin bar for a fraction between zero and one. The width goes through the CSSOM, which the page security policy allows. */
function ProgressBar({ fraction, label }: { fraction: number | null; label: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    bar.current?.style.setProperty('--fraction', String(fraction ?? 0));
  }, [fraction]);
  return (
    <span
      className="saved-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(fraction === null ? {} : { 'aria-valuenow': Math.round(fraction * 100) })}
    >
      <span ref={bar} className="saved-progress-fill" />
    </span>
  );
}

function etaText(etaMs: number | null): string {
  if (etaMs === null) return '';
  const seconds = Math.max(1, Math.round(etaMs / 1000));
  return seconds < 90
    ? `, about ${String(seconds)} seconds left`
    : `, about ${String(Math.round(seconds / 60))} minutes left`;
}

/**
 * What was just recorded, on the Record view only. It shows the video being made, then the saved
 * video, and the way into the editor, so a recording is never a dead end.
 */
export function SavedCard({
  finished,
  job = null,
  onOpenEditor,
  onShowInFolder,
  onRecordAgain,
  onCancelExport,
  onRetrySafer,
  onReveal,
  onExportAgain,
}: SavedCardProps) {
  const working = job !== null && (job.phase === 'queued' || job.phase === 'running');
  const percent =
    job?.progress === null || job === null ? null : Math.round(job.progress.fraction * 100);

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
        {working ? (
          <div className="saved-export" role="status">
            <p className="saved-export-line">
              {job.phase === 'queued' ? 'Waiting to make your video' : 'Making your video'}
              {percent === null ? '' : `, ${String(percent)}%`}
              {job.progress === null ? '' : etaText(job.progress.etaMs)}
            </p>
            <ProgressBar fraction={job.progress?.fraction ?? null} label="Making your video" />
          </div>
        ) : null}
        {job?.phase === 'done' && job.result !== null ? (
          <p className="saved-export-line" role="status">
            Video saved as {job.result.fileName}.
            {job.result.note === null ? '' : ` ${job.result.note}`}
          </p>
        ) : null}
        {job?.phase === 'failed' && job.error !== null ? (
          <div className="saved-export error" role="alert">
            <p className="saved-export-line">{job.error.message}</p>
            <p className="ui-help">{job.error.nextStep}</p>
          </div>
        ) : null}
        {job?.phase === 'cancelled' ? (
          <p className="saved-export-line" role="status">
            The video was not made. Your recording is safe.
          </p>
        ) : null}
      </div>
      <div className="saved-card-actions">
        {working && onCancelExport !== undefined ? (
          <Button
            onClick={() => {
              onCancelExport(job.id);
            }}
          >
            Cancel
          </Button>
        ) : null}
        {job?.phase === 'failed' && onRetrySafer !== undefined ? (
          <Button
            variant="primary"
            onClick={() => {
              onRetrySafer(job.id);
            }}
          >
            Retry with safer settings
          </Button>
        ) : null}
        {job?.phase === 'cancelled' && onExportAgain !== undefined ? (
          <Button variant="primary" onClick={onExportAgain}>
            Make the video
          </Button>
        ) : null}
        {onOpenEditor === undefined ? null : (
          <Button
            variant={job?.phase === 'done' ? 'secondary' : 'primary'}
            icon={<Pencil size={16} strokeWidth={1.75} />}
            onClick={onOpenEditor}
          >
            Open in editor
          </Button>
        )}
        <Button
          icon={<FolderOpen size={16} strokeWidth={1.75} />}
          onClick={() => {
            if (job?.phase === 'done' && onReveal !== undefined) onReveal(job.id, 'output');
            else if (job?.phase === 'failed' && onReveal !== undefined) onReveal(job.id, 'source');
            else onShowInFolder();
          }}
        >
          {job?.phase === 'failed' ? 'Open folder' : 'Show in folder'}
        </Button>
        <Button onClick={onRecordAgain}>Record again</Button>
      </div>
    </section>
  );
}
