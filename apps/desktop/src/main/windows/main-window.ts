import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { SECURE_WEB_PREFERENCES } from '../security';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#FBF8F4',
    // Native frame on Windows and Linux. Hidden inset keeps the traffic lights on macOS.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: join(__dirname, '../preload/index.js') },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  return window;
}
