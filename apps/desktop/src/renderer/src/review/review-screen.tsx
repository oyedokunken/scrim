import { useCallback, useEffect, useState } from 'react';
import { Button, ConfirmDialog, Segmented } from '../../ui';
import { editorApi } from '../shell/editor-bridge';
import { formatBytes, formatMoment, formatTimer } from '../format';
import type { ExportJobView, Finished } from '../hooks';
import { ShareDialog } from '../share/share-dialog';
import { ExportProgress } from './export-progress';
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
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onRetrySafer: (jobId: string) => void;
  onOpenEditor?: () => void;
  onShowInFolder: () => void;
  onRecordAgain: () => void;
  /** Called after the recording was moved to the Recycle Bin. */
  onDiscarded: () => void;
  onProblem: (message: string, nextStep: string) => void;
}

const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** "about 20 seconds left", or nothing before there is a speed to judge by. */
export function etaWords(etaMs: number | null): string {
  if (etaMs === null) return '';
  const seconds = Math.max(1, Math.round(etaMs / 1000));
  return seconds < 90
    ? `, about ${String(seconds)} seconds left`
    : `, about ${String(Math.round(seconds / 60))} minutes left`;
}

/** What the progress row says: the step, the percent and the time left. */
export function progressWords(job: ExportJobView): string {
  const waiting = job.phase === 'queued';
  const percent =
    job.progress === null ? '' : `, ${String(Math.round(job.progress.fraction * 100))}%`;
  return `${waiting ? 'Waiting to make your video' : 'Making your video'}${percent}${
    job.progress === null ? '' : etaWords(job.progress.etaMs)
  }`;
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
 * What the Record page shows after a recording stops: the finished look playing at once, drawn live
 * from the raw tracks, while the one MP4 is made in the background. The real file replaces the live
 * picture when it is ready.
 */
export function ReviewScreen({
  finished,
  job,
  onCancelJob,
  onRetryJob,
  onRetrySafer,
  onOpenEditor,
  onShowInFolder,
  onRecordAgain,
  onDiscarded,
  onProblem,
}: ReviewScreenProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReviewMode>('before');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [live, setLive] = useState<LivePreviewSource | null>(null);
  // A person who has not picked a view yet is moved to After while the video is made.
  const [picked, setPicked] = useState(false);

  const mine = job !== null && !job.preview && job.recording === folderName(finished.folder);
  const rendering = mine ? job : null;
  const working = rendering?.phase === 'queued' || rendering?.phase === 'running';

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

  // Open on mount, and again when the video has just been finished, so the real file is found.
  const renderPhase = rendering?.phase;
  useEffect(() => {
    load();
  }, [load, renderPhase]);

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

  const afterReady = review?.after != null;
  const liveWanted = live !== null && !afterReady;
  if (!picked && live !== null && mode === 'before') setMode('after');

  // The Library entry of the finished file, which the share menu works through.
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const done = rendering?.phase === 'done';
  useEffect(() => {
    if (!done) return undefined;
    let alive = true;
    void window.scrim.invoke('library:lookup', { path: finished.folder }).then(
      (item) => {
        if (alive) setLibraryId(item === null ? null : item.id);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [done, finished.folder]);

  const makeVideo = (): void => {
    void window.scrim.invoke('export:start', { folder: finished.folder });
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
            { value: 'after', label: 'After', disabled: !afterReady && live === null && !working },
            { value: 'compare', label: 'Compare', disabled: !afterReady },
          ]}
        />
      </header>

      {loadError === null ? null : (
        <p className="export-error" role="alert">
          {loadError}
        </p>
      )}

      {/* Above the picture, so the progress and Cancel are in view without scrolling. */}
      {working ? (
        <ProgressRow
          text={progressWords(rendering)}
          label="Making your video"
          fraction={rendering.progress?.fraction ?? null}
          onCancel={() => {
            setConfirmCancel(true);
          }}
        />
      ) : null}

      {review === null ? null : mode === 'after' && !afterReady && !liveWanted ? (
        <div className="review-wait" role="status">
          <p className="saved-export-line">Getting your preview ready</p>
        </div>
      ) : (
        <ReviewPlayer
          mode={mode}
          before={review.before}
          after={review.after}
          live={live ?? undefined}
        />
      )}

      {review === null ? null : (
        <>
          {rendering?.phase === 'done' && rendering.result !== null ? (
            <p className="saved-export-line" role="status" data-testid="review-saved">
              {rendering.result.fellBack
                ? "Saved in Scrim's own folder, because your folder could not be written to."
                : `Saved to ${rendering.result.savedIn}`}
            </p>
          ) : null}
          {rendering?.phase === 'cancelled' ? (
            <div className="saved-export" role="status">
              <p className="saved-export-line">The export was cancelled. Your recording is kept.</p>
              <div className="review-actions">
                <Button variant="primary" onClick={makeVideo}>
                  Make video
                </Button>
              </div>
            </div>
          ) : null}
          {rendering?.phase === 'failed' && rendering.error !== null ? (
            <div className="saved-export error" role="alert">
              <p className="saved-export-line">{rendering.error.message}</p>
              <p className="ui-help">{rendering.error.nextStep}</p>
              <div className="review-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    onRetryJob(rendering.id);
                  }}
                >
                  Try again
                </Button>
                <Button
                  onClick={() => {
                    onRetrySafer(rendering.id);
                  }}
                >
                  Try with safer settings
                </Button>
              </div>
            </div>
          ) : null}

          <div className="review-actions" role="group" aria-label="What to do next">
            {onOpenEditor === undefined ? null : (
              <Button variant="primary" onClick={onOpenEditor}>
                Open in editor
              </Button>
            )}
            <Button onClick={onShowInFolder}>Show in folder</Button>
            <Button
              disabled={libraryId === null}
              onClick={() => {
                setSharing(libraryId);
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
                <dt>Video file</dt>
                <dd>
                  {review.previewBytes === null
                    ? working
                      ? 'Being made'
                      : 'Not made yet'
                    : formatBytes(review.previewBytes)}
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{formatMoment(review.createdAt)}</dd>
              </div>
              <div className="review-fact-wide">
                <dt>Saved in</dt>
                <dd>{review.outputFolder}</dd>
              </div>
            </dl>
            {finished.warnings.map((warning) => (
              <p key={warning} className="ui-help">
                {warning}
              </p>
            ))}
          </div>
        </>
      )}

      {sharing === null ? null : (
        <ShareDialog
          source={{ kind: 'library', id: sharing }}
          onClose={() => {
            setSharing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel && working}
        title="Cancel the export?"
        confirmLabel="Cancel export"
        cancelLabel="Keep exporting"
        destructive
        onCancel={() => {
          setConfirmCancel(false);
        }}
        onConfirm={() => {
          setConfirmCancel(false);
          if (rendering !== null) onCancelJob(rendering.id);
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
        It goes to the Recycle Bin, so you can still get it back from there. A video already saved
        in your folder stays where it is.
      </ConfirmDialog>
    </section>
  );
}
