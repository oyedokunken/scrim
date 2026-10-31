import { useEffect, useState } from 'react';
import { Button } from '../../ui';
import { ExportDoneDialog } from '../review/export-done-dialog';
import { ExportProgress } from '../review/export-progress';
import type { ExportControls, ExportView } from './editor-api';

export interface ExportPanelProps {
  controls: ExportControls;
  folder: string;
  /** Saves the edit list first, so the export sees every change. */
  beforeStart: () => Promise<void>;
}

/** The Export button and the progress, result or error of the last export. */
export function ExportPanel({ controls, folder, beforeStart }: ExportPanelProps) {
  const [job, setJob] = useState<ExportView | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [closedJob, setClosedJob] = useState<string | null>(null);

  useEffect(
    () =>
      controls.subscribe((next) => {
        setJob(next);
      }),
    [controls],
  );

  const busy = starting || job?.phase === 'queued' || job?.phase === 'running';

  const start = (): void => {
    setStarting(true);
    setProblem(null);
    setShowDetail(false);
    void beforeStart()
      .then(() => controls.start(folder))
      .then((result) => {
        if (!result.ok) setProblem(result.message);
      })
      .finally(() => {
        setStarting(false);
      });
  };

  return (
    <section className="ui-section export-panel" aria-label="Export">
      <h2 className="ui-section-title">Export</h2>
      {job?.phase === 'running' || job?.phase === 'queued' ? (
        <>
          <ExportProgress fraction={job.fraction} label="Export progress" />
          <Button
            onClick={() => {
              controls.cancel(job.id);
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={start} disabled={busy}>
          Export MP4
        </Button>
      )}
      {problem === null ? null : (
        <p className="export-error" role="alert">
          {problem}
        </p>
      )}
      <ExportDoneDialog
        done={
          job?.phase === 'done' && job.fileName !== undefined && closedJob !== job.id
            ? {
                jobId: job.id,
                fileName: job.fileName,
                bytes: job.bytes ?? 0,
                durationMs: job.durationMs ?? 0,
                fellBack: job.fellBack === true,
              }
            : null
        }
        folder={folder}
        onDone={() => {
          if (job !== null) setClosedJob(job.id);
        }}
      />
      {job?.phase === 'cancelled' ? (
        <p role="status">Export cancelled. Nothing was saved.</p>
      ) : null}
      {job?.phase === 'failed' ? (
        <div role="alert">
          <p>{job.message ?? 'The export did not finish.'}</p>
          <p className="ui-help">Your recording was not changed.</p>
          <div className="moment-actions">
            <Button
              variant="primary"
              onClick={() => {
                controls.retrySafer(job.id);
              }}
            >
              Retry with safer settings
            </Button>
            <Button
              onClick={() => {
                controls.reveal(job.id, 'source');
              }}
            >
              Open folder
            </Button>
            {job.detail === undefined ? null : (
              <Button
                variant="ghost"
                aria-expanded={showDetail}
                onClick={() => {
                  setShowDetail((v) => !v);
                }}
              >
                Details
              </Button>
            )}
          </div>
          {showDetail && job.detail !== undefined ? (
            <pre className="export-detail">{job.detail}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
