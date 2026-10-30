import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from '../../../shared/library-contract';
import type { OutputOf } from '../../../shared/ipc-contract';

export type OpenedItem = Exclude<
  OutputOf<'library:open'>,
  { kind: 'played' } | { kind: 'missing' }
>;
export type Recoverable = OutputOf<'recording:list-recoverable'>[number];

/** What can be done to one item. The list and the detail page use the same ones. */
export interface LibraryActions {
  open: (id: string) => Promise<OutputOf<'library:open'>>;
  rename: (id: string, name: string) => Promise<OutputOf<'library:rename'>>;
  reveal: (id: string) => Promise<void>;
  openFile: (id: string) => Promise<boolean>;
  /** Puts a screenshot on the clipboard as an image. */
  copyImage: (id: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  recover: (
    folder: string,
  ) => Promise<{ ok: true; folder: string } | { ok: false; message: string }>;
  discard: (folder: string) => Promise<void>;
}

interface LibraryData extends LibraryActions {
  /** Null until the first listing arrives. */
  items: readonly LibraryItem[] | null;
  recoverable: readonly Recoverable[];
  /** Reads the listing again, for example after a file turned out to be gone. */
  reload: () => void;
}

/**
 * The library from the main process: recordings and screenshots, and the unfinished sessions that can
 * be recovered. It reads again each time the page becomes active, and after every action.
 */
export function useLibrary(active: boolean): LibraryData {
  const [items, setItems] = useState<readonly LibraryItem[] | null>(null);
  const [recoverable, setRecoverable] = useState<readonly Recoverable[]>([]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    window.scrim
      .invoke('library:list')
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setItems((current) => current ?? []);
      });
    window.scrim
      .invoke('recording:list-recoverable')
      .then((list) => {
        if (alive) setRecoverable(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active, version]);

  const attempt = useCallback(
    async (run: () => Promise<unknown>): Promise<boolean> => {
      try {
        await run();
        return true;
      } catch {
        return false;
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  return {
    items,
    recoverable,
    reload: refresh,
    open: (id) => window.scrim.invoke('library:open', { id }),
    rename: async (id, name) => {
      try {
        const result = await window.scrim.invoke('library:rename', { id, name });
        refresh();
        return result;
      } catch {
        return { ok: false, reason: 'failed' as const };
      }
    },
    reveal: async (id) => {
      await window.scrim.invoke('library:reveal', { id }).catch(() => undefined);
    },
    openFile: (id) => window.scrim.invoke('library:open-file', { id }).catch(() => false),
    copyImage: async (id) => {
      try {
        const dataUrl = await window.scrim.invoke('library:preview', { id });
        if (dataUrl === null) return false;
        await window.scrim.invoke('image:copy', { dataUrl });
        return true;
      } catch {
        return false;
      }
    },
    remove: (id) => attempt(() => window.scrim.invoke('library:delete', { id })),
    recover: async (folder) => {
      try {
        const result = await window.scrim.invoke('recording:recover', { folder });
        refresh();
        return result.ok
          ? { ok: true, folder: result.value.folder }
          : { ok: false, message: `${result.error.message} ${result.error.nextStep}` };
      } catch {
        return { ok: false, message: 'Scrim could not recover that recording. Try again.' };
      }
    },
    discard: async (folder) => {
      await window.scrim.invoke('recording:dismiss', { folder }).catch(() => undefined);
      refresh();
    },
  };
}
