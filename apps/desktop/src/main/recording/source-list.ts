import { BrowserWindow } from 'electron';
import { listSources, type SourceInfo } from './sources';

/**
 * What can be recorded right now, with a thumbnail for each. Scrim's own windows are left out.
 * Thumbnails are data URLs, so the page that shows them needs `img-src data:`.
 */
export function listRecordableSources(): Promise<SourceInfo[]> {
  return listSources({
    ownSourceIds: () =>
      new Set(
        BrowserWindow.getAllWindows()
          .filter((window) => !window.isDestroyed())
          .map((window) => window.getMediaSourceId()),
      ),
  });
}
