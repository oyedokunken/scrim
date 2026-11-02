import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Segmented } from '../../ui';
import { editorApi } from '../shell/editor-bridge';
import { formatBytes, formatMoment, formatTimer } from '../format';
import type { ExportJobView, Finished } from '../hooks';
import { ShareDialog } from '../share/share-dialog';
import { ExportDoneDialog } from './export-done-dialog';
import { ExportProgress, toPercent } from './export-progress';
import type { LivePreviewSource } from './live-preview';
import { ReviewPlayer, type ReviewMode } from './review-player';

type Review = Extract<
  Awaited<ReturnType<typeof window.scrim.invoke<'review:open'>>>,
  { ok: true }
>['value'];

export interface ReviewScreenProps {
  finished: Finished;
  /** The newest export job. Only the ones for this recording count. */
  job: ExportJobView | null;
  /** Starts the real export into the folder the person chose. */
  onExport: () => void;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onRetrySafer: (jobId: string) => void;
  onOpenEditor?: () => void;
  onShowInFolder: () => void;
  onRecordAgain: () => void;
  /** Called after the recording was moved to the Recycle Bin. */
  onDiscarded: () => void;
  /** Called once the real export is finished and the file is in the chosen folder. */
  onExported: (result: { fellBack: boolean }) => void;
  onProblem: (message: string, nextStep: string) => void;
}

const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function etaText(etaMs: number | null): string {
  if (etaMs === null) return '';
  const seconds = Math.max(1, Math.round(etaMs / 1000));
  return seconds < 90
    ? `, about ${String(seconds)} seconds left`
    : `, about ${String(Math.round(seconds / 60))} minutes left`;
}

interface ProgressRowProps {
  /** What is happening, with the percent and the time left. */
  text: string;
  label: string;
  fraction: number | null;
  onCancel: () => void;
}

/**
 * The progress and the Cancel button on one row. The text and the bar take the room that is left
 * and Cancel keeps its own size at the end, so the two never wrap onto separate lines.
 */
function ProgressRow({ text, label, fraction, onCancel }: ProgressRowProps) {
  return (
    <div className="saved-export-row" role="status">
      <div className="saved-export-main">
        <p className="saved-export-line">{text}</p>
        <ExportProgress fraction={fraction} label={label} />
      </div>
      <Button variant="danger" className="saved-export-cancel" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * What the Record page shows after a recording stops: the raw recording, the finished look, or
 * both side by side. Nothing reaches the person's folder until they press Export.
 */
export function ReviewScreen({
  finished,
  job,
  onExport,
  onCancelJob,
  onRetryJob,
  onRetrySafer,
  onOpenEditor,
  onShowInFolder,
  onRecordAgain,
  onDiscarded,
  onExported,
  onProblem,
}: ReviewScreenProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReviewMode>('before');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [live, setLive] = useState<LivePreviewSource | null>(null);
  // A person who has not picked a view yet is moved to After while the video is made.
  const [picked, setPicked] = useState(false);
  const [doneClosed, setDoneClosed] = useState(false);

  const mine = job !== null && job.recording === folderName(finished.folder);
  const preview = mine && job.preview ? job : null;
  const exporting = mine && !job.preview ? job : null;
  const previewWorking = preview?.phase === 'queued' || preview?.phase === 'running';
  const exportWorking = exporting?.phase === 'queued' || exporting?.phase === 'running';

  const load = useCallback(() => {
    void window.scrim.invoke('review:open', { folder: finished.folder }).then(
      (result) => {
        if (result.ok) {
          // Opening again hands out a new address for the same recording. Keeping the first one
          // stops the picture that is playing from reloading and starting over.
          setReview((current) => ({
            ...result.value,
            before: current?.before ?? result.value.before,
          }));
          setLoadError(null);
        } else {
          setLoadError(result.error.message);
        }
      },
      () => {
        setLoadError('Scrim could not open this recording.');
      },
    );
  }, [finished.folder]);

  // Open on mount, and again when the working copy has just been finished.
  const previewPhase = preview?.phase;
  useEffect(() => {
    load();
  }, [load, previewPhase]);

  // The raw tracks and the saved look, so the finished picture can be drawn live while it renders.
  useEffect(() => {
    let alive = true;
    void Promise.all([editorApi.open(finished.folder), window.scrim.invoke('settings:get')]).then(
      ([opened, settings]) => {
        if (alive && opened.ok) setLive({ project: opened.project, settings });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [finished.folder]);

  const exportDone = exporting?.phase === 'done';
  const fellBack = exporting?.result?.fellBack === true;
  const doneResult = exportDone ? exporting.result : null;

  const afterReady = review?.after != null;
  // The live picture stands in until the file exists, and through the moment between the two.
  const liveWanted =
    live !== null && (previewWorking || (preview?.phase === 'done' && !afterReady));
  if (!picked && liveWanted && mode === 'before') setMode('after');

  const retry = (): void => {
    if (preview !== null) onRetryJob(preview.id);
    else void window.scrim.invoke('export:start', { folder: finished.folder, preview: true });
  };

  return (
    <section className="review" aria-labelledby="review-title">
      <header className="review-head">
        <h2 id="review-title" className="review-title">
          {finished.recovered ? 'Recording recovered' : 'Review your recording'}
        </h2>
        <Segmented
          label="View"
          value={mode}
          onChange={(next) => {
            setPicked(true);
            setMode(next);
          }}
          options={[
            { value: 'before', label: 'Before' },
            {
              value: 'after',
              label: 'After',
              disabled: !afterReady && !previewWorking && preview?.phase !== 'failed',
            },
            { value: 'compare', label: 'Compare', disabled: !afterReady },
          ]}
        />
      </header>

      {loadError === null ? null : (
        <p className="export-error" role="alert">
          {loadError}
        </p>
      )}

      {review === null ? null : mode === 'after' && !afterReady && !liveWanted ? (
        <div className="review-wait" role="status">
          {previewWorking ? (
            <>
              <p className="saved-export-line">
                {preview.phase === 'queued' ? 'Waiting to make your video' : 'Making your video'}
                {preview.progress === null
                  ? ''
                  : `, ${String(Math.round(preview.progress.fraction * 100))}%`}
                {preview.progress === null ? '' : etaText(preview.progress.etaMs)}
              </p>
              <ExportProgress
                fraction={preview.progress?.fraction ?? null}
                label="Making your video"
              />
              <Button
                onClick={() => {
                  onCancelJob(preview.id);
                }}
              >
                Cancel
              </Button>
            </>
          ) : preview?.phase === 'failed' && preview.error !== null ? (
            <div role="alert">
              <p className="saved-export-line">{preview.error.message}</p>
              <p className="ui-help">{preview.error.nextStep}</p>
              <div className="review-actions">
                <Button variant="primary" onClick={retry}>
                  Try again
                </Button>
                <Button
                  onClick={() => {
                    onRetrySafer(preview.id);
                  }}
                >
                  Try with safer settings
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="saved-export-line">The finished look has not been made yet.</p>
              <Button variant="primary" onClick={retry}>
                Make it now
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <ReviewPlayer
            mode={mode}
            before={review.before}
            after={review.after}
            live={liveWanted || review.after !== null ? (live ?? undefined) : undefined}
          />
          {previewWorking && mode === 'after' && review.after === null ? (
            <ProgressRow
              text={`${preview.phase === 'queued' ? 'Waiting to make your video' : 'Making your video'}${
                preview.progress === null
                  ? ''
                  : `, ${String(Math.round(preview.progress.fraction * 100))}%`
              }${preview.progress === null ? '' : etaText(preview.progress.etaMs)}`}
              label="Making your video"
              fraction={preview.progress?.fraction ?? null}
              onCancel={() => {
                onCancelJob(preview.id);
              }}
            />
          ) : null}
        </>
      )}

      {review === null ? null : (
        <>
          <div className="review-info">
            <p className="review-name">{review.name}</p>
            <dl className="review-facts">
              <div>
                <dt>Length</dt>
                <dd>{formatTimer(review.durationMs)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>
                  {review.width > 0
                    ? `${String(review.width)} by ${String(review.height)}`
                    : 'Unknown'}
                </dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>{review.fps === null ? 'Unknown' : `${String(Math.round(review.fps))} fps`}</dd>
              </div>
              <div>
                <dt>Recording file</dt>
                <dd>{formatBytes(review.rawBytes)}</dd>
              </div>
              <div>
                <dt>Preview file</dt>
                <dd>
                  {review.previewBytes === null ? 'Not made yet' : formatBytes(review.previewBytes)}
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{formatMoment(review.createdAt)}</dd>
              </div>
              <div className="review-fact-wide">
                <dt>Export goes to</dt>
                <dd>{review.outputFolder}</dd>
              </div>
            </dl>
            {finished.warnings.map((warning) => (
              <p key={warning} className="ui-help">
                {warning}
              </p>
            ))}
          </div>

          {exportWorking ? (
            <ProgressRow
              text={`Exporting your video${
                exporting.progress === null
                  ? ''
                  : `, ${String(Math.round(exporting.progress.fraction * 100))}%`
              }${exporting.progress === null ? '' : etaText(exporting.progress.etaMs)}`}
              label="Exporting"
              fraction={exporting.progress?.fraction ?? null}
              onCancel={() => {
                setConfirmCancel(true);
              }}
            />
          ) : null}
          {exporting?.phase === 'failed' && exporting.error !== null ? (
            <div className="saved-export error" role="alert">
              <p className="saved-export-line">{exporting.error.message}</p>
              <p className="ui-help">{exporting.error.nextStep}</p>
              <div className="review-actions">
                <Button variant="primary" onClick={onExport}>
                  Try again
                </Button>
                <Button
                  onClick={() => {
                    onRetrySafer(exporting.id);
                  }}
                >
                  Try with safer settings
                </Button>
              </div>
            </div>
          ) : null}

          <div className="review-actions" role="group" aria-label="What to do next">
            <Button variant="primary" disabled={exportWorking} onClick={onExport}>
              {exportWorking
                ? `Exporting ${String(toPercent(exporting.progress?.fraction ?? null))}%`
                : 'Export'}
            </Button>
            {onOpenEditor === undefined ? null : (
              <Button onClick={onOpenEditor}>Open in editor</Button>
            )}
            <Button onClick={onShowInFolder}>Show in folder</Button>
            <Button
              onClick={() => {
                setSharing(true);
              }}
            >
              Share
            </Button>
            <Button onClick={onRecordAgain}>Record again</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(true);
              }}
            >
              Discard
            </Button>
          </div>
        </>
      )}

      {sharing ? (
        <ShareDialog
          source={{ kind: 'review', folder: finished.folder }}
          onClose={() => {
            setSharing(false);
          }}
        />
      ) : null}

      <ExportDoneDialog
        done={
          exporting === null || doneResult === null || doneClosed
            ? null
            : {
                jobId: exporting.id,
                fileName: doneResult.fileName,
                bytes: doneResult.bytes,
                durationMs: doneResult.durationMs,
                fellBack,
              }
        }
        folder={finished.folder}
        onDone={() => {
          setDoneClosed(true);
          onExported({ fellBack });
        }}
      />

      <ConfirmDialog
        open={confirmCancel && exportWorking}
        title="Cancel the export?"
        confirmLabel="Cancel export"
        cancelLabel="Keep exporting"
        destructive
        onCancel={() => {
          setConfirmCancel(false);
        }}
        onConfirm={() => {
          setConfirmCancel(false);
          if (exporting !== null) onCancelJob(exporting.id);
        }}
      >
        The unfinished file is removed. Your recording is kept.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this recording?"
        confirmLabel="Move to Recycle Bin"
        destructive
        onCancel={() => {
          setConfirmDiscard(false);
        }}
        onConfirm={() => {
          setConfirmDiscard(false);
          void window.scrim.invoke('review:discard', { folder: finished.folder }).then(
            (result) => {
              if (result.ok) onDiscarded();
              else onProblem(result.error.message, result.error.nextStep);
            },
            () => {
              onProblem('Scrim could not discard this recording.', 'Try again.');
            },
          );
        }}
      >
        It goes to the Recycle Bin, so you can still get it back from there.
      </ConfirmDialog>
    </section>
  );
}
