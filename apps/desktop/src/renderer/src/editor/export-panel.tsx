import { useEffect, useState } from 'react';
import { Button } from '../../ui';
import type { ExportControls, ExportView } from './editor-api';

export interface ExportPanelProps {
  controls: ExportControls;
  folder: string;
  /** Saves the edit list first, so the export sees every change. */
  beforeStart: () => Promise<void>;
}

/** Percent text for the progress line. */
export function percent(fraction: number | null): string {
  return fraction === null ? 'Starting' : `${String(Math.round(fraction * 100))}%`;
}

/** The Export button and the progress, result or error of the last export. */
export function ExportPanel({ controls, folder, beforeStart }: ExportPanelProps) {
  const [job, setJob] = useState<ExportView | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

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
          <progress max={1} value={job.fraction ?? undefined} aria-label="Export progress" />
          <p className="ui-help" role="status">
            {percent(job.fraction)}
          </p>
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
      {job?.phase === 'done' ? (
        <div role="status">
          <p>Saved{job.fileName === undefined ? '' : ` as ${job.fileName}`}.</p>
          <Button
            onClick={() => {
              controls.reveal(job.id, 'output');
            }}
          >
            Show in folder
          </Button>
        </div>
      ) : null}
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
