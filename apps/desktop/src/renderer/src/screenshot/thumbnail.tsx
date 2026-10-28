import { Image } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadThumbnail } from './thumbnails';

export interface ThumbnailProps {
  path: string;
  /** The file's time, so a changed file loads a new picture. */
  version: number;
  className?: string;
}

/** A 16 by 9 picture of a screenshot. The space is reserved, so a list never jumps as pictures arrive. */
export function Thumbnail({ path, version, className }: ThumbnailProps) {
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${path}|${String(version)}`;

  useEffect(() => {
    let alive = true;
    void loadThumbnail(path, version).then((url) => {
      if (alive) setLoaded({ key, url });
    });
    return () => {
      alive = false;
    };
  }, [path, version, key]);

  const url = loaded?.key === key ? loaded.url : null;
  return (
    <span className={className === undefined ? 'thumb' : `thumb ${className}`}>
      {url === null ? (
        <Image size={20} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <img src={url} alt="" draggable={false} />
      )}
    </span>
  );
}
