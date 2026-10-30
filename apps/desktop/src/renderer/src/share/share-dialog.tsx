import {
  Copy,
  FolderOpen,
  GripHorizontal,
  Image,
  Link2,
  Mail,
  Minimize2,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Dialog, useShowError, useToast } from '../../ui';
import type { OutputOf } from '../../../shared/ipc-contract';
import {
  LARGE_VIDEO_BYTES,
  type ShareAction,
  type ShareSource,
} from '../../../shared/share-contract';
import { formatBytes } from '../format';

type Info = OutputOf<'share:info'>;

export interface ShareDialogProps {
  /** What to share. Null keeps the dialog closed. */
  source: ShareSource | null;
  onClose: () => void;
  /** Called when the file turned out to be gone, so the Library can offer to drop it from its list. */
  onMissing?: () => void;
}

interface Row {
  action: ShareAction;
  label: string;
  Icon: LucideIcon;
  show: (info: Extract<Info, { ok: true }>) => boolean;
}

const ROWS: readonly Row[] = [
  { action: 'app', label: 'Share with an app', Icon: Share2, show: (info) => info.can.app },
  { action: 'copy-file', label: 'Copy file', Icon: Copy, show: (info) => info.can.copyFile },
  { action: 'copy-image', label: 'Copy image', Icon: Image, show: (info) => info.can.copyImage },
  { action: 'email', label: 'Email', Icon: Mail, show: (info) => info.can.email },
  { action: 'reveal', label: 'Show in folder', Icon: FolderOpen, show: (info) => info.can.reveal },
];

/**
 * The one share menu, for the editor, the review screen, the Library cards and the detail page.
 * It asks the main process what this file and this computer can do, shows only that, and tells
 * the person in plain words how each action went.
 */
export function ShareDialog({ source, onClose, onMissing }: ShareDialogProps) {
  const toast = useToast();
  const showError = useShowError();
  const [read, setRead] = useState<{ of: ShareSource; value: Info } | null>(null);
  const [busy, setBusy] = useState<ShareAction | null>(null);

  useEffect(() => {
    if (source === null) return undefined;
    let alive = true;
    void window.scrim.invoke('share:info', { source }).then(
      (value) => {
        if (alive) setRead({ of: source, value });
      },
      () => {
        if (alive) {
          setRead({
            of: source,
            value: { ok: false, reason: 'missing', message: 'Scrim could not read that file.' },
          });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [source]);

  // An answer for an earlier source does not count, so a new one starts with the loading line.
  const info = read?.of === source ? read.value : null;

  // The list appears after the file was read, so the first action takes focus then.
  const loaded = info?.ok === true;
  useEffect(() => {
    if (!loaded) return;
    document.querySelector<HTMLElement>('.share-sheet [data-autofocus]')?.focus();
  }, [loaded]);

  function run(action: ShareAction): void {
    {
      if (source === null) return;
      setBusy(action);
      void window.scrim
        .invoke('share:run', { source, action })
        .catch((): OutputOf<'share:run'> => ({
          ok: false,
          reason: 'failed',
          message: 'Scrim could not do that. Try again.',
        }))
        .then((result) => {
          setBusy(null);
          if (result.ok) {
            toast(result.message);
            onClose();
            return;
          }
          showError({
            title:
              result.reason === 'missing'
                ? 'Scrim could not find that file'
                : result.reason === 'not-ready'
                  ? 'The video is not ready yet'
                  : 'Scrim could not share it',
            message: result.message,
            code: `share-${result.reason}`,
            ...(result.reason === 'failed' || result.reason === 'not-ready'
              ? {
                  retry: () => {
                    run(action);
                  },
                }
              : {}),
            ...(result.reason === 'missing' && onMissing !== undefined
              ? { actions: [{ label: 'Remove it from the Library', run: onMissing }] }
              : {}),
          });
        });
    }
  }

  const ok = info?.ok === true ? info : null;
  const failed = info?.ok === false ? info : null;

  return (
    <Dialog open={source !== null} title="Share" onClose={onClose} className="share-sheet">
      {info === null ? (
        <p className="ui-help" role="status">
          Looking at the file
        </p>
      ) : failed !== null ? (
        <div role="alert">
          <p>{failed.message}</p>
          {failed.reason === 'missing' && onMissing !== undefined ? (
            <Button onClick={onMissing}>Remove it from the Library</Button>
          ) : null}
        </div>
      ) : ok === null ? null : (
        <div className="share-body">
          <p className="share-file">
            <span className="share-name">{ok.name}</span>
            <span className="ui-help">{formatBytes(ok.bytes)}</span>
          </p>
          {ok.large ? (
            <div className="share-warning" role="note">
              <p>
                This video is {formatBytes(ok.bytes)}. Many apps and mail services limit attachments
                to {formatBytes(LARGE_VIDEO_BYTES)} or less.
              </p>
              <Button
                icon={<Minimize2 size={16} strokeWidth={1.75} />}
                disabled={busy !== null}
                onClick={() => {
                  run('smaller');
                }}
              >
                Make a smaller copy
              </Button>
              <p className="ui-help">
                The copy is 720p with a lower bitrate. Your original is not changed.
              </p>
            </div>
          ) : null}
          {busy === 'smaller' ? (
            <p className="ui-help" role="status">
              Making a smaller copy. This can take a minute.
            </p>
          ) : null}
          <div className="share-actions" role="group" aria-label="Share options">
            {ROWS.filter((row) => row.show(ok)).map(({ action, label, Icon }, index) => (
              <Button
                key={action}
                className="share-action"
                icon={<Icon size={16} strokeWidth={1.75} />}
                disabled={busy !== null}
                {...(index === 0 ? { 'data-autofocus': true } : {})}
                onClick={() => {
                  run(action);
                }}
              >
                {label}
              </Button>
            ))}
            {ok.can.drag ? (
              <button
                type="button"
                className="ui-button ui-button-secondary share-action share-drag"
                draggable
                aria-label="Drag the file into another app"
                onDragStart={(event) => {
                  event.preventDefault();
                  if (source !== null) void window.scrim.invoke('share:drag', { source });
                }}
              >
                <span className="ui-button-icon" aria-hidden="true">
                  <GripHorizontal size={16} strokeWidth={1.75} />
                </span>
                Drag out
              </button>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="share-secondary"
            icon={<Link2 size={16} strokeWidth={1.75} />}
            disabled={busy !== null || source?.kind === 'edited'}
            onClick={() => {
              run('copy-path');
            }}
          >
            Copy file path
          </Button>
        </div>
      )}
    </Dialog>
  );
}
