import { Copy, FolderOpen, Pencil, Save, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, useShowError, useToast } from '../../ui';
import { ShareDialog } from '../share/share-dialog';
import { usePlatformInfo } from '../platform';

export interface ScreenshotResultProps {
  path: string;
  width: number;
  height: number;
  /** Opens the editor for this screenshot. */
  onEdit: () => void;
  /** Called after the screenshot is deleted, which returns to taking one. */
  onDone: () => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : path;
}

const WAITING = 'The screenshot is still opening.';

/** What you just captured: a preview, and what to do with it. It was already saved and copied. */
export function ScreenshotResult({ path, width, height, onEdit, onDone }: ScreenshotResultProps) {
  const platform = usePlatformInfo();
  const toast = useToast();
  const showError = useShowError();
  const [loaded, setLoaded] = useState<{ path: string; dataUrl: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.scrim
      .invoke('image:read', { path })
      .then((dataUrl) => {
        if (alive) setLoaded({ path, dataUrl });
      })
      .catch(() => {
        if (alive) setLoaded({ path, dataUrl: null });
      });
    return () => {
      alive = false;
    };
  }, [path]);

  // A result for another path is stale, so it counts as still loading.
  const current = loaded?.path === path ? loaded : null;
  const source = current?.dataUrl ?? null;
  const failed = current !== null && current.dataUrl === null;

  const copy = (): void => {
    if (source === null) return;
    void window.scrim
      .invoke('image:copy', { dataUrl: source })
      .then(() => {
        toast('Copied to the clipboard');
      })
      .catch(() => {
        showError({
          title: 'Scrim could not copy the screenshot',
          message: 'Try again.',
          code: 'copy-failed',
          retry: copy,
        });
      });
  };

  const saveAs = (): void => {
    if (source === null) return;
    void window.scrim
      .invoke('image:save-as', { dataUrl: source, name: fileName(path) })
      .then((result) => {
        if (result.path !== null) toast(`Saved ${fileName(result.path)}`);
      })
      .catch(() => {
        showError({
          title: 'Scrim could not save the screenshot there',
          message: 'Try another folder.',
          code: 'save-failed',
          retry: saveAs,
        });
      });
  };

  const remove = (): void => {
    setConfirmDelete(false);
    void window.scrim
      .invoke('image:delete', { path })
      .then(() => {
        toast('Moved the screenshot to the recycle bin');
        onDone();
      })
      .catch(() => {
        showError({
          title: 'Scrim could not delete the screenshot',
          message: 'Try again.',
          code: 'delete-failed',
          retry: remove,
        });
      });
  };

  return (
    <section className="shot-result" aria-label="Your screenshot">
      <div className="shot-preview">
        {source === null ? (
          <p className="ui-help" role={failed ? 'alert' : undefined}>
            {failed
              ? 'Scrim could not open this screenshot. It may have been moved or deleted.'
              : 'Opening the screenshot'}
          </p>
        ) : (
          <img
            className="shot-preview-image"
            src={source}
            alt={`Screenshot ${String(width)} by ${String(height)}`}
            draggable
            onDragStart={(event) => {
              event.preventDefault();
              void window.scrim.invoke('image:drag', { path });
            }}
          />
        )}
      </div>
      <aside className="review-side" aria-label="Details and actions">
        <div className="review-side-scroll">
          <h3 className="lib-detail-name">{fileName(path)}</h3>
          <dl className="lib-detail-facts">
            <div>
              <dt>Size</dt>
              <dd>{`${String(width)} by ${String(height)}`}</dd>
            </div>
            <div>
              <dt>Saved in</dt>
              <dd>{folderOf(path)}</dd>
            </div>
          </dl>
          <p className="ui-help">It was saved and copied to the clipboard.</p>
        </div>
        <div className="lib-detail-actions six" role="group" aria-label="What to do next">
          <Button variant="primary" icon={<Pencil size={16} strokeWidth={1.75} />} onClick={onEdit}>
            Edit
          </Button>
          <Button
            icon={<Copy size={16} strokeWidth={1.75} />}
            disabled={source === null}
            disabledReason={WAITING}
            onClick={copy}
          >
            Copy
          </Button>
          <Button
            icon={<Save size={16} strokeWidth={1.75} />}
            disabled={source === null}
            disabledReason={WAITING}
            onClick={saveAs}
          >
            Save as
          </Button>
          <Button
            icon={<FolderOpen size={16} strokeWidth={1.75} />}
            onClick={() => {
              void window.scrim.invoke('shell:show-in-folder', { path });
            }}
          >
            Show in folder
          </Button>
          <Button
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            Delete
          </Button>
          {platform.shareSheet ? (
            <Button
              icon={<Share2 size={16} strokeWidth={1.75} />}
              disabled={source === null}
              disabledReason={WAITING}
              onClick={() => {
                setSharing(true);
              }}
            >
              Share
            </Button>
          ) : null}
        </div>
      </aside>

      <ShareDialog
        source={
          sharing && source !== null
            ? { kind: 'edited', dataUrl: source, name: fileName(path).replace(/\.png$/i, '') }
            : null
        }
        onClose={() => {
          setSharing(false);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this screenshot?"
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={remove}
      >
        <p>It moves to the recycle bin, so you can still get it back from there.</p>
      </ConfirmDialog>
    </section>
  );
}
