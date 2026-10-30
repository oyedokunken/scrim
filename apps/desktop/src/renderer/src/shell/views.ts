/** The items of the icon rail, in order. The divider sits before the library. */
export const VIEW_IDS = [
  'record',
  'screenshot',
  'cursor',
  'zoom',
  'camera',
  'audio',
  'background',
  'library',
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

/** Library and Settings use the whole width, so they have no right panel. The editor has its own. */
export function hasPanel(view: ViewId): boolean {
  return view !== 'library' && view !== 'settings' && view !== 'editor';
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
