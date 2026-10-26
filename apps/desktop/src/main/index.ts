import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { hardenSession, hardenWebContents } from './harden';
import { createMainWindow } from './windows/main-window';

const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
// Packaged pages load from file, whose origin is the string "null".
const appOrigin = devUrl ? new URL(devUrl).origin : 'file://';

function openMainWindow(): BrowserWindow {
  const window = createMainWindow();
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, appOrigin);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = openMainWindow();
  });

  void app.whenReady().then(() => {
    hardenSession(appOrigin);
    mainWindow = openMainWindow();
  });
}
