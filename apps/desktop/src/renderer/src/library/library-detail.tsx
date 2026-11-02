import {
  ArrowLeft,
  Clapperboard,
  Copy,
  FolderOpen,
  Image,
  Pencil,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog, useShowError, useToast } from '../../ui';
import type { LibraryItem } from '../../../shared/library-contract';
import { formatBytes, formatMoment, formatTimer } from '../format';
import { useExportJob } from '../hooks';
import { fullFileName } from './library-model';
import { ShareDialog } from '../share/share-dialog';
import type { OpenedItem } from './use-library';
import type { LibraryActions } from './use-library';

export interface LibraryDetailProps {
  item: LibraryItem;
  /** Start playing as soon as the view opens, for a recording opened from its play badge. */
  autoPlay?: boolean;
  actions: LibraryActions;
  /** Goes back to the list, which keeps its scroll position and filters. */
  onBack: () => void;
  /** Opens the editor for a recording that still has its working files. */
  onOpened: (opened: OpenedItem) => void;
  /** Reads the Library again, when a shared file turned out to be gone. */
  onReload: () => void;
}

/** Everything about one library item: a preview, its details, and what to do with it. */
export function LibraryDetail({
  item,
  autoPlay = false,
  actions,
  onBack,
  onOpened,
  onReload,
}: LibraryDetailProps) {
  const toast = useToast();
  const showError = useShowError();
  const job = useExportJob();
  const [preview, setPreview] = useState<{ id: string; url: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  /** True from pressing Make video until that render ends. */
  const [making, setMaking] = useState(false);
  const wasWorking = useRef(false);

  // A screenshot shows its full picture and a recording its real video. An item with no MP4 has neither.
  useEffect(() => {
    let alive = true;
    const load =
      item.kind === 'screenshot'
        ? window.scrim.invoke('library:preview', { id: item.id })
        : item.hasVideo
          ? window.scrim.invoke('library:media', { id: item.id })
          : Promise.resolve(null);
    void load
      .catch(() => null)
      .then((url) => {
        if (alive) setPreview({ id: item.id, url });
      });
    return () => {
      alive = false;
    };
  }, [item.id, item.kind, item.hasVideo]);

  // When the render that Make video started ends, the Library is read again so the MP4 shows up.
  const phase = job !== null && !job.preview ? job.phase : null;
  const working = phase === 'queued' || phase === 'running';
  useEffect(() => {
    if (!making) return;
    if (working) {
      wasWorking.current = true;
      return;
    }
    if (!wasWorking.current) return;
    wasWorking.current = false;
    setMaking(false);
    if (phase === 'done') {
      onReload();
    } else if (phase === 'failed') {
      showError({
        title: 'Scrim could not make the video',
        message: job?.error?.message ?? 'Something went wrong while making the video.',
        ...(job?.error?.nextStep === undefined ? {} : { nextStep: job.error.nextStep }),
        code: 'make-video-failed',
      });
    }
  }, [making, working, phase, job, onReload, showError]);

  const makeVideo = (): void => {
    setMaking(true);
    void window.scrim.invoke('library:make-video', { id: item.id }).then(
      (queued) => {
        if (!queued) {
          setMaking(false);
          missing();
        }
      },
      () => {
        setMaking(false);
        missing();
      },
    );
  };

  const url = preview?.id === item.id ? preview.url : null;
  const missing = (): void => {
    showError({
      title: 'Scrim could not find that file',
      message: 'It may have been moved or deleted. Go back to the Library to see what is there.',
      code: 'file-missing',
    });
  };

  const copyImage = (): void => {
    void actions.copyImage(item.id).then((ok) => {
      if (ok) toast('Copied to the clipboard');
      else {
        showError({
          title: 'Scrim could not copy the screenshot',
          message: 'Try again.',
          code: 'copy-failed',
          retry: copyImage,
        });
      }
    });
  };

  const facts: (readonly [string, string])[] = [
    ['File name', fullFileName(item)],
    ['Type', item.kind === 'screenshot' ? 'Screenshot (PNG)' : 'Recording (MP4)'],
    ['Size', item.bytes > 0 ? formatBytes(item.bytes) : 'Not exported yet'],
    ...(item.durationMs === null ? [] : [['Duration', formatTimer(item.durationMs)] as const]),
    ...(item.width === null || item.height === null
      ? []
      : [['Dimensions', `${String(item.width)} by ${String(item.height)}`] as const]),
    ['Created', formatMoment(item.createdMs)],
    ['Folder', item.folder],
  ];

  return (
    <section className="lib-detail" aria-label={`Details for ${item.name}`}>
      <div className="lib-detail-bar">
        <Button
          icon={<ArrowLeft size={16} strokeWidth={1.75} />}
          onClick={onBack}
          aria-keyshortcuts="Escape Alt+ArrowLeft"
        >
          Back
        </Button>
      </div>
      <div className="lib-detail-body">
        <div className="lib-detail-preview">
          {url === null ? (
            item.kind === 'screenshot' ? (
              <Image size={40} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <div className="lib-detail-novideo">
                <Video size={40} strokeWidth={1.5} aria-hidden="true" />
                {item.hasVideo ? null : <p className="ui-help">The video is not made yet.</p>}
              </div>
            )
          ) : item.kind === 'recording' ? (
            <video
              key={url}
              src={url}
              controls
              preload="metadata"
              autoPlay={autoPlay}
              aria-label={`Video ${item.name}`}
            />
          ) : (
            <img
              src={url}
              alt={`Screenshot ${item.name}`}
              draggable={item.isFile}
              onDragStart={(event) => {
                event.preventDefault();
                if (item.isFile) {
                  void window.scrim.invoke('share:drag', {
                    source: { kind: 'library', id: item.id },
                  });
                }
              }}
            />
          )}
        </div>
        <div className="lib-detail-side">
          <h2 className="lib-detail-name">{fullFileName(item)}</h2>
          <dl className="lib-detail-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div
            className={`lib-detail-actions ${item.kind === 'screenshot' ? 'five' : 'four'}`}
            role="group"
            aria-label="Actions"
          >
            <Button
              icon={<Pencil size={16} strokeWidth={1.75} />}
              disabled={item.kind === 'recording' && !item.canEdit}
              onClick={() => {
                void actions.open(item.id).then((opened) => {
                  if (opened.kind === 'editor' || opened.kind === 'screenshot') onOpened(opened);
                  else if (opened.kind === 'missing') missing();
                });
              }}
            >
              Edit
            </Button>
            {item.kind === 'screenshot' ? (
              <Button icon={<Copy size={16} strokeWidth={1.75} />} onClick={copyImage}>
                Copy
              </Button>
            ) : null}
            <Button
              icon={<Share2 size={16} strokeWidth={1.75} />}
              disabled={!item.isFile}
              onClick={() => {
                setSharing(true);
              }}
            >
              Share
            </Button>
            <Button
              icon={<FolderOpen size={16} strokeWidth={1.75} />}
              onClick={() => {
                void actions.reveal(item.id);
              }}
            >
              Show in folder
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 size={16} strokeWidth={1.75} />}
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              Delete
            </Button>
          </div>
          {item.kind === 'recording' && !item.hasVideo && item.canEdit ? (
            <div className="lib-detail-make">
              <Button
                variant="primary"
                icon={<Clapperboard size={16} strokeWidth={1.75} />}
                disabled={making}
                onClick={makeVideo}
              >
                {making ? 'Making video' : 'Make video'}
              </Button>
              <p className="ui-help" role="status">
                {making
                  ? working && job?.progress != null
                    ? `Making your video, ${String(Math.round(job.progress.fraction * 100))}%`
                    : 'Making your video'
                  : 'This recording has no video file yet. Your working files are kept as they are.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <ShareDialog
        source={sharing ? { kind: 'library', id: item.id } : null}
        onClose={() => {
          setSharing(false);
        }}
        onMissing={() => {
          setSharing(false);
          onReload();
          onBack();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${item.name}?`}
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          void actions.remove(item.id).then((ok) => {
            if (ok) {
              toast('Moved to the recycle bin');
              onBack();
            } else {
              showError({
                title: 'Scrim could not delete it',
                message: 'Close any program that is using the file, then try again.',
                code: 'delete-failed',
              });
            }
          });
        }}
      >
        <p>
          {item.kind === 'screenshot'
            ? 'The screenshot moves to the recycle bin, so you can still get it back from there.'
            : 'The video and its editing files move to the recycle bin, so you can still get them back from there.'}
        </p>
      </ConfirmDialog>
    </section>
  );
}
