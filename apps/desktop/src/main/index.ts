import { app, BrowserWindow, protocol, session } from 'electron';
import { join } from 'node:path';
import { handleAppRequest } from './app-protocol';
import { buildCsp } from './csp';
import { hardenSession, hardenWebContents } from './harden';
import { APP_SCHEME, resolveRendererTarget } from './renderer-target';
import { createMainWindow } from './windows/main-window';

// Sandbox every renderer, including any window or frame created later. Must run before ready.
app.enableSandbox();

// Must run before the app is ready. The scheme is secure and standard so the page behaves like
// an https origin, and so the CSP and the permission checks have a real origin to match.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

const target = resolveRendererTarget({
  isPackaged: app.isPackaged,
  devUrl: process.env['ELECTRON_RENDERER_URL'],
});
const rendererRoot = join(__dirname, '../renderer');

function openMainWindow(): BrowserWindow {
  const window = createMainWindow();
  void window.loadURL(target.url);
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  const appCsp = buildCsp({ packaged: true });

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, target.origin);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = openMainWindow();
  });

  void app.whenReady().then(() => {
    session.defaultSession.protocol.handle(APP_SCHEME, (request) =>
      handleAppRequest(request, rendererRoot, appCsp),
    );
    hardenSession({
      appOrigin: target.origin,
      devCsp: target.kind === 'dev' ? buildCsp({ packaged: false }) : undefined,
    });
    mainWindow = openMainWindow();
  });
}
