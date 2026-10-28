const cache = new Map<string, string>();
const waiting: (() => void)[] = [];
let running = 0;
const MAX_PARALLEL = 3;

function next(): void {
  while (running < MAX_PARALLEL) {
    const start = waiting.shift();
    if (start === undefined) return;
    running += 1;
    start();
  }
}

/**
 * A small picture of a file, asked of the main process three at a time so a long list does not
 * flood the bridge. The key holds the file's time, so an edited file never shows an old picture.
 * Null when the file cannot be read.
 */
export function loadThumbnail(path: string, version: number): Promise<string | null> {
  const key = `${path}|${String(version)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  return new Promise((resolve) => {
    waiting.push(() => {
      void window.scrim
        .invoke('image:thumbnail', { path })
        .then(
          (dataUrl) => {
            cache.set(key, dataUrl);
            resolve(dataUrl);
          },
          () => {
            resolve(null);
          },
        )
        .finally(() => {
          running -= 1;
          next();
        });
    });
    next();
  });
}
