import { ExternalLink, FolderOpen, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Dialog } from '../../ui';
import { formatBytes, formatTimer } from '../format';
import { ShareDialog } from '../share/share-dialog';

/** What the dialog needs of a finished export. It carries no path. */
interface ExportDone {
  jobId: string;
  fileName: string;
  bytes: number;
  durationMs: number;
  fellBack: boolean;
}

export interface ExportDoneDialogProps {
  /** The finished export. Null keeps the dialog closed. */
  done: ExportDone | null;
  /** The recording's working folder, used to find the finished file in the Library. */
  folder: string;
  /** Called when the person presses Done or closes the dialog. */
  onDone: () => void;
}

interface Found {
  id: string;
  folder: string;
}

/** The plain words that say where the file went. */
export function savedWhere(fellBack: boolean, folder: string | null): string {
  if (fellBack) return "Scrim's own folder, because your folder could not be written to";
  return folder ?? 'The folder you chose';
}

/**
 * The window that opens when an export finishes: the file name, its size and length, where it
 * went, and what to do next. Share is the one share menu, reached through the Library entry of
 * the new file, because the working copy used for review is already gone.
 */
export function ExportDoneDialog({ done, folder, onDone }: ExportDoneDialogProps) {
  const [found, setFound] = useState<Found | null>(null);
  const [sharing, setSharing] = useState(false);

  const jobId = done?.jobId;
  useEffect(() => {
    if (jobId === undefined) return undefined;
    let alive = true;
    void window.scrim.invoke('library:lookup', { path: folder }).then(
      (item) => {
        if (alive) setFound(item === null ? null : { id: item.id, folder: item.folder });
      },
      () => undefined,
    );
    return () => {
      alive = false;
      setFound(null);
    };
  }, [jobId, folder]);

  if (done === null) return null;

  return (
    <>
      <Dialog open title="Your video is ready" onClose={onDone} className="export-done">
        <p className="export-done-name">{done.fileName}</p>
        <dl className="export-done-facts">
          <dt>Size</dt>
          <dd>{formatBytes(done.bytes)}</dd>
          <dt>Length</dt>
          <dd>{formatTimer(done.durationMs)}</dd>
          <dt>Saved in</dt>
          <dd>{savedWhere(done.fellBack, found?.folder ?? null)}</dd>
        </dl>
        {done.fellBack ? (
          <p className="ui-help">
            Windows would not let Scrim save to your folder, so the video is in Scrim&apos;s own
            folder. To save to your folder again, allow Scrim under Windows Security, Ransomware
            protection, Controlled folder access, or choose another folder.
          </p>
        ) : null}
        <div className="export-done-grid">
          <Button
            icon={<FolderOpen size={16} strokeWidth={2} />}
            onClick={() => {
              void window.scrim.invoke('export:reveal', { jobId: done.jobId, what: 'output' });
            }}
          >
            Show in folder
          </Button>
          <Button
            icon={<ExternalLink size={16} strokeWidth={2} />}
            disabled={found === null}
            onClick={() => {
              if (found !== null) void window.scrim.invoke('library:play', { id: found.id });
            }}
          >
            Open
          </Button>
          <Button
            icon={<Share2 size={16} strokeWidth={2} />}
            disabled={found === null}
            onClick={() => {
              setSharing(true);
            }}
          >
            Share
          </Button>
          <Button variant="primary" data-autofocus onClick={onDone}>
            Done
          </Button>
        </div>
      </Dialog>
      {sharing && found !== null ? (
        <ShareDialog
          source={{ kind: 'library', id: found.id }}
          onClose={() => {
            setSharing(false);
          }}
        />
      ) : null}
    </>
  );
}
