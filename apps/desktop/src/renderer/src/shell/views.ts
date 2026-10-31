/** The items of the icon rail, in order. Only Settings is pinned to the bottom. */
export const VIEW_IDS = [
  'record',
  'screenshot',
  'library',
  'cursor',
  'zoom',
  'camera',
  'audio',
  'background',
  'settings',
] as const;

/** The items of the rail. */
export type RailViewId = (typeof VIEW_IDS)[number];

/** A rail item, or the editor, which has no rail item and is opened from a recording or the Library. */
export type ViewId = RailViewId | 'editor';

export const VIEW_LABELS: Record<ViewId, string> = {
  editor: 'Editor',
  record: 'Record',
  screenshot: 'Screenshot',
  cursor: 'Cursor',
  zoom: 'Zoom',
  camera: 'Camera',
  audio: 'Audio',
  background: 'Background',
  library: 'Library',
  settings: 'Settings',
};

/**
 * Only the pages that change how a recording looks keep a right panel. Record and Screenshot put
 * their few controls under the main view, and Library, Settings and the editor use the full width.
 */
export function hasPanel(view: ViewId): boolean {
  return isSettingsPanel(view);
}

/**
 * The rail item that shows as selected. A screenshot or recording opened from the Library keeps the
 * Library selected, whatever page it leads to, until the person picks another rail item.
 */
export function railView(view: ViewId, openedFrom: ViewId | null): ViewId {
  if (openedFrom === 'library' && (view === 'editor' || view === 'screenshot')) return 'library';
  return view;
}

/** The settings views whose panels the editor and the record view share. */
export function isSettingsPanel(view: ViewId): boolean {
  return (
    view === 'cursor' ||
    view === 'zoom' ||
    view === 'camera' ||
    view === 'audio' ||
    view === 'background'
  );
}

export function isViewId(value: string): value is RailViewId {
  return (VIEW_IDS as readonly string[]).includes(value);
}

/** The "Recording saved" card belongs to the Record view alone, never to the shared layout. */
export function showsSavedCard(view: ViewId): boolean {
  return view === 'record';
}
