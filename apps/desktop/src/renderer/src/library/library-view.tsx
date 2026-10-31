import {
  Copy,
  ExternalLink,
  FolderOpen,
  Image,
  Pencil,
  Search,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Menu,
  Segmented,
  Tooltip,
  useShowError,
  useToast,
} from '../../ui';
import type { LibraryItem } from '../../../shared/library-contract';
import { formatWhen } from '../format';
import { useClock } from '../hooks';
import {
  cardFacts,
  emptyReason,
  fullFileName,
  isNew,
  thumbKey,
  visibleItems,
  type LibraryFilter,
  type LibraryOrder,
} from './library-model';
import { ShareDialog } from '../share/share-dialog';
import type { ShareSource } from '../../../shared/share-contract';
import { LibraryDetail } from './library-detail';
import { useLibrary, type OpenedItem, type Recoverable } from './use-library';

const thumbCache = new Map<string, string | null>();

interface CardProps {
  item: LibraryItem;
  now: number;
  onOpen: () => void;
  onOpenFile: () => void;
  onRename: () => void;
  onReveal: () => void;
  onCopy: () => void;
  onShare: () => void;
  onDelete: () => void;
}

function Card({
  item,
  now,
  onOpen,
  onOpenFile,
  onRename,
  onReveal,
  onCopy,
  onShare,
  onDelete,
}: CardProps) {
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

  const icon = (size: number) =>
    item.kind === 'screenshot' ? (
      <Image size={size} strokeWidth={1.5} aria-hidden="true" />
    ) : (
      <Video size={size} strokeWidth={1.5} aria-hidden="true" />
    );

  const menu = [
    ...(item.isFile
      ? [
          {
            key: 'open',
            label: 'Open',
            icon: <ExternalLink size={16} strokeWidth={1.75} />,
            onSelect: onOpenFile,
          },
        ]
      : []),
    {
      key: 'reveal',
      label: 'Show in folder',
      icon: <FolderOpen size={16} strokeWidth={1.75} />,
      onSelect: onReveal,
    },
    ...(item.isFile && item.kind === 'screenshot'
      ? [
          {
            key: 'copy',
            label: 'Copy',
            icon: <Copy size={16} strokeWidth={1.75} />,
            onSelect: onCopy,
          },
        ]
      : []),
    ...(item.isFile
      ? [
          {
            key: 'share',
            label: 'Share',
            icon: <Share2 size={16} strokeWidth={1.75} />,
            onSelect: onShare,
          },
          {
            key: 'rename',
            label: 'Rename',
            icon: <Pencil size={16} strokeWidth={1.75} />,
            onSelect: onRename,
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
      <button
        type="button"
        className="lib-open"
        onClick={onOpen}
        aria-label={`Open ${item.name}`}
        draggable={item.isFile}
        onDragStart={(event) => {
          event.preventDefault();
          if (item.isFile) {
            void window.scrim.invoke('share:drag', { source: { kind: 'library', id: item.id } });
          }
        }}
      >
        {isNew(item, now) ? <span className="lib-new">NEW</span> : null}
        <span className="thumb lib-thumb">
          {url === null ? icon(24) : <img src={url} alt="" draggable={false} />}
        </span>
      </button>
      <div className="lib-meta">
        <div className="lib-text">
          <Tooltip label={fullFileName(item)}>
            <span className="lib-card-name">{item.name}</span>
          </Tooltip>
          <span className="lib-facts">
            <span
              className="lib-type"
              role="img"
              aria-label={item.kind === 'screenshot' ? 'Screenshot' : 'Recording'}
            >
              {icon(14)}
            </span>
            {cardFacts(item, now).map((fact) => (
              <span key={fact} className="lib-fact">
                {fact}
              </span>
            ))}
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
  /** The item whose detail page is open when the Library mounts, for coming back from an editor. */
  initialDetailId?: string | null;
  /** Called when the open detail page changes, so the page that owns the Library can remember it. */
  onDetail?: (id: string | null) => void;
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
export function LibraryView({
  onOpened,
  onRecord,
  active,
  initialDetailId = null,
  onDetail,
}: LibraryViewProps) {
  const toast = useToast();
  const showError = useShowError();
  const now = useClock();
  const library = useLibrary(active);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [order, setOrder] = useState<LibraryOrder>('newest');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [dismissing, setDismissing] = useState<Recoverable | null>(null);
  const [detailId, setDetailId] = useState<string | null>(initialDetailId);
  useEffect(() => {
    onDetail?.(detailId);
  }, [detailId, onDetail]);
  const [sharing, setSharing] = useState<ShareSource | null>(null);
  const scrollTop = useRef(0);

  const openDetail = (id: string): void => {
    const scroller = document.querySelector('.shell-main');
    scrollTop.current = scroller?.scrollTop ?? 0;
    try {
      window.history.pushState(null, '', `#/library/${id}`);
    } catch {
      // A page that cannot change its address still shows the detail.
    }
    setDetailId(id);
  };

  const closeDetail = (): void => {
    if (window.location.hash.startsWith('#/library/')) window.history.back();
    else setDetailId(null);
  };

  // The route is the address: back, forward and a closed page all leave the detail the same way.
  useEffect(() => {
    const onPop = (): void => {
      const match = /^#\/library\/(.+)$/.exec(window.location.hash);
      setDetailId(match?.[1] ?? null);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (detailId === null || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]') !== null) return;
      if (event.key === 'Escape' || (event.altKey && event.key === 'ArrowLeft')) {
        event.preventDefault();
        closeDetail();
      }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  });

  // Leaving the Library while a detail is open must not leave its address behind.
  useEffect(
    () => () => {
      if (window.location.hash.startsWith('#/library/')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (detailId !== null) return;
    const scroller = document.querySelector('.shell-main');
    if (scroller !== null) scroller.scrollTop = scrollTop.current;
  }, [detailId]);

  const items = library.items;
  const shown = useMemo(
    () => (items === null ? [] : visibleItems(items, { filter, query, order })),
    [items, filter, query, order],
  );

  const submitRename = (): void => {
    const item = renaming;
    if (item === null) return;
    void library.rename(item.id, renameText).then((result) => {
      if (result.ok) {
        setRenaming(null);
        toast('Renamed');
      } else if (result.reason === 'exists') {
        showError({
          title: 'That name is taken',
          message: 'A file with that name already exists. Pick another name.',
          code: 'rename-exists',
        });
      } else if (result.reason === 'invalid') {
        showError({
          title: 'That name cannot be used',
          message: 'Avoid slashes, colons and question marks.',
          code: 'rename-invalid',
        });
      } else {
        showError({
          title: 'Scrim could not rename it',
          message: 'Close any program that is using the file, then try again.',
          code: 'rename-failed',
          retry: submitRename,
        });
      }
    });
  };

  const detailItem = detailId === null ? undefined : items?.find((entry) => entry.id === detailId);

  const reason = items === null ? 'has-items' : emptyReason(items.length, shown.length);

  if (detailItem !== undefined) {
    return (
      <LibraryDetail
        item={detailItem}
        actions={library}
        onBack={closeDetail}
        onOpened={onOpened}
        onReload={library.reload}
      />
    );
  }

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
                      showError({
                        title: 'Scrim could not recover that recording',
                        message: result.message,
                        code: 'recover-failed',
                      });
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
              onOpen={() => {
                openDetail(item.id);
              }}
              onOpenFile={() => {
                void library.openFile(item.id).then((ok) => {
                  if (!ok) {
                    showError({
                      title: 'Scrim could not find that file',
                      message:
                        'It may have been moved or deleted. The Library shows what is there now.',
                      code: 'file-missing',
                    });
                  }
                });
              }}
              onCopy={() => {
                void library.copyImage(item.id).then((ok) => {
                  if (ok) toast('Copied to the clipboard');
                  else {
                    showError({
                      title: 'Scrim could not copy the screenshot',
                      message: 'Try again.',
                      code: 'copy-failed',
                    });
                  }
                });
              }}
              onRename={() => {
                setRenameText(item.name);
                setRenaming(item);
              }}
              onReveal={() => {
                void library.reveal(item.id);
              }}
              onShare={() => {
                setSharing({ kind: 'library', id: item.id });
              }}
              onDelete={() => {
                setDeleting(item);
              }}
            />
          ))}
        </ul>
      )}

      <ShareDialog
        source={sharing}
        onClose={() => {
          setSharing(null);
        }}
        onMissing={() => {
          setSharing(null);
          library.reload();
        }}
      />

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
            if (ok) toast('Moved to the recycle bin');
            else {
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
