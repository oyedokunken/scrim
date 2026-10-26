import { app, BrowserWindow, protocol, session } from 'electron';
import { join } from 'node:path';
import { APP_ID, APP_NAME } from '../shared/app-id';
import { devDockIconPath } from './app-icon';
import { handleAppRequest } from './app-protocol';
import { buildCsp } from './csp';
import { hardenSession, hardenWebContents } from './harden';
import { registerRecording } from './recording';
import { APP_SCHEME, resolveRendererTarget } from './renderer-target';
import { applyApplicationMenu } from './shell/menu';
import { createStubRecorder } from './shell/recorder-control';
import { createShell } from './shell/shell-controller';
import { createWindowStateTracker } from './shell/window-state-tracker';
import { createMainWindow, MAIN_WINDOW_DEFAULT, MAIN_WINDOW_MINIMUM } from './windows/main-window';

// Groups the taskbar buttons and keeps the icon on pinned shortcuts. Same id as the installer.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const appCsp = buildCsp({ packaged: true });

  // The recording engine replaces this stub when it is wired in. The shell only sees the interface.
  const recorder = createStubRecorder();
  if (!app.isPackaged && process.env['SCRIM_E2E'] === '1') {
    // End to end tests drive the fake recorder from the main process. Never in a packaged app.
    (globalThis as { __scrimRecorder?: unknown }).__scrimRecorder = recorder;
  }
  const shell = createShell({
    recorder,
    platform: process.platform,
    appPath: app.getAppPath(),
    env: process.env,
  });
  const windowState = createWindowStateTracker(MAIN_WINDOW_DEFAULT, MAIN_WINDOW_MINIMUM);

  async function openMainWindow(): Promise<BrowserWindow> {
    const window = createMainWindow(await windowState.initialBounds());
    windowState.track(window);
    shell.attachWindow(window);
    void window.loadURL(target.url);
    return window;
  }

  app.on('second-instance', () => {
    shell.show();
  });
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, target.origin);
  });
  app.on('before-quit', (event) => {
    shell.beforeQuit(event);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openMainWindow();
    else shell.show();
  });

  void app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({ applicationName: APP_NAME });
      // A packaged app takes its icon from the bundle. While developing there is no bundle.
      if (!app.isPackaged) app.dock?.setIcon(devDockIconPath(app.getAppPath()));
    }
    // Before any window exists, so Windows and Linux never flash the default Electron menu.
    applyApplicationMenu(process.platform, APP_NAME);
    session.defaultSession.protocol.handle(APP_SCHEME, (request) =>
      handleAppRequest(request, rendererRoot, appCsp),
    );
    hardenSession({
      appOrigin: target.origin,
      devCsp: target.kind === 'dev' ? buildCsp({ packaged: false }) : undefined,
    });
    shell.start();
    await openMainWindow();
    registerRecording({ appOrigin: target.origin });
  });
}
