import { join } from 'node:path';

export type TrayAction = 'show' | 'start' | 'stop' | 'quit';

export interface TrayMenuItem {
  id: TrayAction | 'separator';
  label?: string;
}

/**
 * The tray menu. Stop recording shows only while recording, and Start recording only while
 * idle, so the menu never offers something that cannot happen.
 */
export function buildTrayMenu(recording: boolean): TrayMenuItem[] {
  return [
    { id: 'show', label: 'Show Scrim' },
    recording ? { id: 'stop', label: 'Stop recording' } : { id: 'start', label: 'Start recording' },
    { id: 'separator' },
    { id: 'quit', label: 'Quit Scrim' },
  ];
}

export function trayTooltip(recording: boolean): string {
  return recording ? 'Scrim is recording' : 'Scrim';
}

/** The tray icon size the system draws best: 16 at 100 percent scaling, then 24 and 32. */
export function trayIconSize(platform: NodeJS.Platform, scaleFactor: number): 16 | 24 | 32 {
  if (platform === 'linux') return 24;
  if (scaleFactor < 1.25) return 16;
  if (scaleFactor < 1.75) return 24;
  return 32;
}

export interface TrayIconChoice {
  /** Relative to resources/icons. */
  file: string;
  /** macOS tints template images for light and dark menu bars. A red dot cannot be tinted. */
  template: boolean;
  /** Pixel density the file was drawn for. */
  scaleFactor: 1 | 2;
}

/**
 * Which tray icon file to use. macOS idle uses the glyph-only template image, which the system
 * colors. While recording on macOS the colored icon is used instead, because the record red dot
 * would be lost in a template.
 */
export function chooseTrayIcon(
  platform: NodeJS.Platform,
  scaleFactor: number,
  recording: boolean,
): TrayIconChoice {
  if (platform === 'darwin') {
    return recording
      ? { file: join('tray', 'tray-recording-32.png'), template: false, scaleFactor: 2 }
      : { file: join('tray', 'trayTemplate@2x.png'), template: true, scaleFactor: 2 };
  }
  const size = trayIconSize(platform, scaleFactor);
  return {
    file: join('tray', recording ? `tray-recording-${size}.png` : `tray-${size}.png`),
    template: false,
    scaleFactor: 1,
  };
}

/**
 * Whether a tray can be relied on. Windows and macOS always have one. Linux depends on the
 * desktop: GNOME shows no tray icons without an extension, so a window hidden there could not be
 * brought back. Treat it as missing unless the person opts in.
 */
export function isTrayAvailable(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  if (platform !== 'linux') return true;
  if (env['SCRIM_TRAY'] === '1') return true;
  const desktop = (env['XDG_CURRENT_DESKTOP'] ?? '').toLowerCase();
  return desktop !== '' && !desktop.includes('gnome');
}
