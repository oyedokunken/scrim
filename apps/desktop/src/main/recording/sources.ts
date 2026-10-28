import { desktopCapturer } from 'electron';
import type { WindowTile } from '../../recorder/region/protocol';

/** A screen or window the person can pick on the home screen. */
export interface SourceInfo {
  /** The capture source id, as `window:123:0` or `screen:0:0`. A window is recorded by this id. */
  id: string;
  kind: 'display' | 'window';
  name: string;
  /** For a display, the system's display id, as the recording service expects it. */
  displayId?: string | undefined;
  /** A small picture of it, as a data URL. */
  thumbnail: string;
  /** The window's own icon, as a data URL, when it has one. */
  icon?: string | undefined;
}

/** The fields of a capture source that listing needs. */
export interface RawSource {
  id: string;
  name: string;
  display_id: string;
  thumbnailDataUrl: string;
  appIconDataUrl?: string | undefined;
}

/**
 * Turns the capture sources into the list the home screen shows: screens first, then windows
 * sorted by name. Windows with no name, and Scrim's own windows, are left out, because recording
 * Scrim's own control by mistake would be worse than not offering it.
 */
export function toSourceList(raw: readonly RawSource[], ownIds: ReadonlySet<string>): SourceInfo[] {
  const displays: SourceInfo[] = [];
  const windows: SourceInfo[] = [];
  for (const source of raw) {
    if (ownIds.has(source.id)) continue;
    if (source.id.startsWith('screen:')) {
      displays.push({
        id: source.id,
        kind: 'display',
        name: source.name,
        displayId: source.display_id === '' ? undefined : source.display_id,
        thumbnail: source.thumbnailDataUrl,
      });
    } else if (source.id.startsWith('window:') && source.name.trim() !== '') {
      windows.push({
        id: source.id,
        kind: 'window',
        name: source.name,
        thumbnail: source.thumbnailDataUrl,
        icon: source.appIconDataUrl,
      });
    }
  }
  windows.sort((a, b) => a.name.localeCompare(b.name));
  return [...displays, ...windows];
}

export interface SourceListDeps {
  /** Capture source ids that belong to Scrim's own windows. */
  ownSourceIds: () => ReadonlySet<string>;
}

const THUMBNAIL = { width: 320, height: 180 } as const;

/** Lists what can be recorded right now, with a thumbnail for each. */
export async function listSources(deps: SourceListDeps): Promise<SourceInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: THUMBNAIL,
    fetchWindowIcons: true,
  });
  return toSourceList(
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id,
      thumbnailDataUrl: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
      appIconDataUrl: source.appIcon.isEmpty() ? undefined : source.appIcon.toDataURL(),
    })),
    deps.ownSourceIds(),
  );
}

/** The fields of a window source that a card needs. */
export interface RawWindow {
  id: string;
  name: string;
  png: Uint8Array;
}

/**
 * The windows to offer as cards: those with a name and a picture, without Scrim's own, sorted by
 * name. The picture is raw PNG bytes, so the overlay can draw it without a URL.
 */
export function toWindowTiles(
  raw: readonly RawWindow[],
  ownIds: ReadonlySet<string>,
): WindowTile[] {
  return raw
    .filter(
      (window) =>
        window.id.startsWith('window:') &&
        window.name.trim() !== '' &&
        window.png.byteLength > 0 &&
        !ownIds.has(window.id),
    )
    .map((window) => ({ id: window.id, name: window.name, png: window.png }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CARD = { width: 480, height: 270 } as const;

/** Lists the windows that can be picked, with a PNG of each, for the area overlay. */
export async function listWindowTiles(deps: SourceListDeps): Promise<WindowTile[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: CARD,
  });
  return toWindowTiles(
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      png: source.thumbnail.isEmpty() ? new Uint8Array() : new Uint8Array(source.thumbnail.toPNG()),
    })),
    deps.ownSourceIds(),
  );
}
