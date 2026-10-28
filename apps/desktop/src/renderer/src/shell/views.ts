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

export type ViewId = (typeof VIEW_IDS)[number];

export const VIEW_LABELS: Record<ViewId, string> = {
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

/** Library and Settings use the whole width, so they have no right panel. */
export function hasPanel(view: ViewId): boolean {
  return view !== 'library' && view !== 'settings';
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

export function isViewId(value: string): value is ViewId {
  return (VIEW_IDS as readonly string[]).includes(value);
}
