import { useCallback, useEffect, useState } from 'react';
import { customBackgroundOf } from '../../../shared/backgrounds-contract';
import type { OutputOf } from '../../../shared/ipc-contract';

export type AddBackgroundOutcome = OutputOf<'backgrounds:add'>;

export interface BackgroundImageView {
  id: string;
  name: string;
  /** The picture as a data URL, which the page's policy allows. Null while it is being read. */
  url: string | null;
}

/** Pictures already read, so a tile, the preview and the editor never ask twice for one. */
const urls = new Map<string, string | null>();

async function readUrl(id: string): Promise<string | null> {
  const known = urls.get(id);
  if (known !== undefined) return known;
  const url = await window.scrim.invoke('backgrounds:read', { id }).catch(() => null);
  if (url !== null) urls.set(id, url);
  return url;
}

/** The person's own background pictures, with add and remove. A failed call leaves an empty list. */
export function useBackgroundImages(): {
  images: readonly BackgroundImageView[];
  add: () => Promise<AddBackgroundOutcome>;
  remove: (id: string) => Promise<boolean>;
} {
  const [images, setImages] = useState<readonly BackgroundImageView[]>([]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const list = await window.scrim.invoke('backgrounds:list');
      setImages(list.map((item) => ({ ...item, url: urls.get(item.id) ?? null })));
      const read = await Promise.all(list.map((item) => readUrl(item.id)));
      setImages(list.map((item, index) => ({ ...item, url: read[index] ?? null })));
    } catch {
      setImages([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async (): Promise<AddBackgroundOutcome> => {
    try {
      const outcome = await window.scrim.invoke('backgrounds:add');
      if (outcome.ok) await load();
      return outcome;
    } catch {
      return {
        ok: false,
        reason: 'failed',
        message: 'Scrim could not add that image. Try again.',
      };
    }
  }, [load]);

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const removed = await window.scrim.invoke('backgrounds:remove', { id });
        urls.delete(id);
        await load();
        return removed;
      } catch {
        return false;
      }
    },
    [load],
  );

  return { images, add, remove };
}

/** The data URL for a stored background id, or null for a preset, none, or a picture that is gone. */
export function useBackgroundUrl(backgroundId: string): string | null {
  const imageId = customBackgroundOf(backgroundId);
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (imageId === null) return undefined;
    let alive = true;
    void readUrl(imageId).then((url) => {
      if (alive) setLoaded({ id: imageId, url });
    });
    return () => {
      alive = false;
    };
  }, [imageId]);
  return imageId !== null && loaded?.id === imageId ? loaded.url : null;
}

/** The picture behind a stored background id, loaded and ready to draw. Null until it is. */
export function useBackgroundElement(backgroundId: string): HTMLImageElement | null {
  const url = useBackgroundUrl(backgroundId);
  const [loaded, setLoaded] = useState<{ url: string; element: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (url === null) return undefined;
    let alive = true;
    const element = new Image();
    element.onload = () => {
      if (alive) setLoaded({ url, element });
    };
    element.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return url !== null && loaded?.url === url ? loaded.element : null;
}
