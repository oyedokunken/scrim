import { FolderOpen, Image, Pencil, Search, Share2, Trash2, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, ConfirmDialog, Dialog, Menu, Segmented, useToast } from '../../ui';
import type { LibraryItem } from '../../../shared/library-contract';
import { formatWhen } from '../format';
import { useClock } from '../hooks';
import {
  emptyReason,
  itemKindLabel,
  thumbKey,
  visibleItems,
  type LibraryFilter,
  type LibraryOrder,
} from './library-model';
import { useLibrary, type OpenedItem, type Recoverable } from './use-library';

const thumbCache = new Map<string, string | null>();

interface CardProps {
  item: LibraryItem;
  now: number;
  canShare: boolean;
  onOpen: () => void;
  onRename: () => void;
  onReveal: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function Card({ item, now, canShare, onOpen, onRename, onReveal, onShare, onDelete }: CardProps) {
  const key = thumbKey(item);
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  const url = thumbCache.get(key) ?? (loaded?.key === key ? loaded.url : null);

  useEffect(() => {
    if (thumbCache.has(key)) return undefined;
    let alive = true;
    void window.scrim
      .invoke('library:thumbnail', { id: item.id })
      .catch(() => null)
      .then((value) => {
        thumbCache.set(key, value);
        if (alive) setLoaded({ key, url: value });
      });
    return () => {
      alive = false;
    };
  }, [key, item.id]);

  const menu = [
    ...(item.isFile
      ? [
          {
            key: 'rename',
            label: 'Rename',
            icon: <Pencil size={16} strokeWidth={1.75} />,
            onSelect: onRename,
          },
        ]
      : []),
    {
      key: 'reveal',
      label: 'Show in folder',
      icon: <FolderOpen size={16} strokeWidth={1.75} />,
      onSelect: onReveal,
    },
    ...(canShare && item.isFile
      ? [
          {
            key: 'share',
            label: 'Share',
            icon: <Share2 size={16} strokeWidth={1.75} />,
            onSelect: onShare,
          },
        ]
      : []),
    {
      key: 'delete',
      label: 'Delete',
      danger: true,
      icon: <Trash2 size={16} strokeWidth={1.75} />,
      onSelect: onDelete,
    },
  ];

  return (
    <li className="lib-card">
      <button type="button" className="lib-open" onClick={onOpen} aria-label={`Open ${item.name}`}>
        <span className="thumb lib-thumb">
          {url === null ? (
            item.kind === 'screenshot' ? (
              <Image size={24} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Video size={24} strokeWidth={1.5} aria-hidden="true" />
            )
          ) : (
            <img src={url} alt="" draggable={false} />
          )}
        </span>
      </button>
      <div className="lib-meta">
        <div className="lib-text">
          <span className="lib-name" title={item.name}>
            {item.name}
          </span>
          <span className="lib-sub">
            {itemKindLabel(item)}, {formatWhen(item.createdMs, now)}
          </span>
        </div>
        <Menu label={`More for ${item.name}`} items={menu} />
      </div>
    </li>
  );
}

export interface LibraryViewProps {
  /** Brings the main window to the editor or the screenshot result. */
  onOpened: (opened: OpenedItem) => void;
  /** The empty state's call to action. */
  onRecord: () => void;
  /** True while the Library is the visible page, so it reads the disk again each time it opens. */
  active: boolean;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'recording', label: 'Recordings' },
  { value: 'screenshot', label: 'Screenshots' },
] as const;

const ORDERS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
] as const;

/** Every recording and screenshot as cards, with filter chips, search, sort, and the actions on each. */
export function LibraryView({ onOpened, onRecord, active }: LibraryViewProps) {
  const toast = useToast();
  const now = useClock();
  const library = useLibrary(active);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [order, setOrder] = useState<LibraryOrder>('newest');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [dismissing, setDismissing] = useState<Recoverable | null>(null);

  const items = library.items;
  const shown = useMemo(
    () => (items === null ? [] : visibleItems(items, { filter, query, order })),
    [items, filter, query, order],
  );

  const open = (item: LibraryItem): void => {
    void library.open(item.id).then(
      (opened) => {
        if (opened.kind === 'missing') {
          toast('Scrim could not find that file. It may have been moved.');
        } else if (opened.kind === 'played') {
          toast('Opened in your video player');
        } else {
          onOpened(opened);
        }
      },
      () => {
        toast('Scrim could not open that. Try again.');
      },
    );
  };

  const submitRename = (): void => {
    const item = renaming;
    if (item === null) return;
    void library.rename(item.id, renameText).then((result) => {
      if (result.ok) {
        setRenaming(null);
        toast('Renamed');
      } else if (result.reason === 'exists') {
        toast('A file with that name already exists. Pick another name.');
      } else if (result.reason === 'invalid') {
        toast('That name cannot be used. Avoid slashes, colons and question marks.');
      } else {
        toast('Scrim could not rename it. Close any program that is using the file and try again.');
      }
    });
  };

  const reason = items === null ? 'has-items' : emptyReason(items.length, shown.length);

  return (
    <section className="library" aria-label="Library">
      <div className="lib-toolbar">
        <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
        <label className="lib-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search by name"
            placeholder="Search by name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <Segmented label="Sort by date" options={ORDERS} value={order} onChange={setOrder} />
      </div>

      {library.recoverable.length === 0 ? null : (
        <ul className="lib-recover" aria-label="Unfinished recordings">
          {library.recoverable.map((session) => (
            <li key={session.folder} className="lib-recover-row">
              <span className="lib-badge">Recover</span>
              <span className="lib-recover-text">
                <span className="lib-name">{session.name}</span>
                <span className="lib-sub">
                  Scrim closed before this was saved.{' '}
                  {formatWhen(Date.parse(session.createdAt), now)}
                </span>
              </span>
              <Button
                variant="primary"
                aria-label={`Recover ${session.name}`}
                onClick={() => {
                  void library.recover(session.folder).then((result) => {
                    if (result.ok) {
                      toast('Recording recovered');
                      onOpened({ kind: 'editor', folder: result.folder });
                    } else {
                      toast(result.message);
                    }
                  });
                }}
              >
                Recover
              </Button>
              <Button
                aria-label={`Discard ${session.name}`}
                onClick={() => {
                  setDismissing(session);
                }}
              >
                Discard
              </Button>
            </li>
          ))}
        </ul>
      )}

      {items === null ? (
        <p className="ui-help" role="status">
          Loading
        </p>
      ) : reason === 'nothing-yet' && library.recoverable.length === 0 ? (
        <div className="lib-empty">
          <Video size={40} strokeWidth={1.5} aria-hidden="true" />
          <p className="lib-empty-title">Nothing here yet</p>
          <p className="ui-help">Your recordings and screenshots will show up here.</p>
          <Button variant="primary" onClick={onRecord}>
            Record your screen
          </Button>
        </div>
      ) : reason === 'no-match' ? (
        <p className="ui-help">Nothing matches. Clear the search or pick All.</p>
      ) : (
        <ul className="lib-grid">
          {shown.map((item) => (
            <Card
              key={item.id}
              item={item}
              now={now}
              canShare={library.canShare}
              onOpen={() => {
                open(item);
              }}
              onRename={() => {
                setRenameText(item.name);
                setRenaming(item);
              }}
              onReveal={() => {
                void library.reveal(item.id);
              }}
              onShare={() => {
                void library.share(item.id).then((ok) => {
                  if (!ok) toast('Scrim could not open the share sheet. Try again.');
                });
              }}
              onDelete={() => {
                setDeleting(item);
              }}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={renaming !== null}
        title="Rename"
        onClose={() => {
          setRenaming(null);
        }}
      >
        <form
          className="lib-rename"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <input
            data-autofocus
            className="ui-input"
            aria-label="New name"
            value={renameText}
            maxLength={120}
            onChange={(event) => {
              setRenameText(event.target.value);
            }}
          />
          <div className="ui-confirm-actions">
            <Button
              onClick={() => {
                setRenaming(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={renameText.trim() === ''}>
              Rename
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          const item = deleting;
          setDeleting(null);
          if (item === null) return;
          void library.remove(item.id).then((ok) => {
            toast(ok ? 'Moved to the recycle bin' : 'Scrim could not delete it. Try again.');
          });
        }}
      >
        <p>
          {deleting?.kind === 'screenshot'
            ? 'The screenshot moves to the recycle bin, so you can still get it back from there.'
            : 'The video and its editing files move to the recycle bin, so you can still get them back from there.'}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dismissing !== null}
        title="Discard this unfinished recording?"
        confirmLabel="Discard"
        destructive
        onCancel={() => {
          setDismissing(null);
        }}
        onConfirm={() => {
          const session = dismissing;
          setDismissing(null);
          if (session !== null) void library.discard(session.folder);
        }}
      >
        <p>This recording was never saved. Discarding it removes the footage Scrim kept.</p>
      </ConfirmDialog>
    </section>
  );
}
