import { Camera, Copy, FolderOpen, Pencil, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, useToast } from '../../ui';

export interface ScreenshotResultProps {
  path: string;
  width: number;
  height: number;
  /** Opens the editor for this screenshot. */
  onEdit: () => void;
  /** Back to taking one. Called after the screenshot is deleted too. */
  onDone: () => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** What you just captured: a preview, and what to do with it. It was already saved and copied. */
export function ScreenshotResult({ path, width, height, onEdit, onDone }: ScreenshotResultProps) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<{ path: string; dataUrl: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        toast('Scrim could not copy the screenshot. Try again.');
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
        toast('Scrim could not save the screenshot there. Try another folder.');
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
        toast('Scrim could not delete the screenshot. Try again.');
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
      <p className="ui-help">
        Saved as {fileName(path)} and copied to the clipboard. {String(width)} by {String(height)}.
      </p>
      <div className="shot-result-actions">
        <Button variant="primary" icon={<Pencil size={16} strokeWidth={1.75} />} onClick={onEdit}>
          Edit
        </Button>
        <Button
          icon={<Copy size={16} strokeWidth={1.75} />}
          disabled={source === null}
          onClick={copy}
        >
          Copy
        </Button>
        <Button
          icon={<Save size={16} strokeWidth={1.75} />}
          disabled={source === null}
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
        <Button icon={<Camera size={16} strokeWidth={1.75} />} onClick={onDone}>
          Take another
        </Button>
      </div>

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
