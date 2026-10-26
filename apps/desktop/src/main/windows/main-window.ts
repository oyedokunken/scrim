import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { ResolvedBounds } from '../shell/window-state';
import { createAppWindow } from './create-window';

export const MAIN_WINDOW_DEFAULT = { width: 960, height: 640 } as const;
export const MAIN_WINDOW_MINIMUM = { width: 720, height: 520 } as const;

export function createMainWindow(bounds: ResolvedBounds): BrowserWindow {
  const window = createAppWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x === undefined || bounds.y === undefined ? {} : { x: bounds.x, y: bounds.y }),
    minWidth: MAIN_WINDOW_MINIMUM.width,
    minHeight: MAIN_WINDOW_MINIMUM.height,
    show: false,
    backgroundColor: '#FBF8F4',
    // Native frame on Windows and Linux. Hidden inset keeps the traffic lights on macOS.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  if (bounds.maximized) window.maximize();
  window.once('ready-to-show', () => {
    window.show();
  });
  return window;
}
