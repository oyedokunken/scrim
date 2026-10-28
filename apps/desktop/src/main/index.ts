import {
  app,
  BrowserWindow,
  globalShortcut,
  protocol,
  session,
  shell as electronShell,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_ID, APP_NAME } from '../shared/app-id';
import { devDockIconPath } from './app-icon';
import { handleAppRequest } from './app-protocol';
import { buildCsp } from './csp';
import { hardenSession, hardenWebContents } from './harden';
import { createAppLogger, startIpc } from './ipc/start';
import { registerRecording } from './recording';
import { createPillController } from './recording/pill-controller';
import { createPillWindow } from './recording/pill-window';
import type { SettingsStore } from './settings/settings-store';
import { APP_SCHEME, resolveRendererTarget } from './renderer-target';
import { applyApplicationMenu } from './shell/menu';
import { createStubRecorder } from './shell/recorder-control';
import { createRecordingWindows } from './shell/recording-windows';
import { createAreaPicker } from './recording/area-picker';
import { buildAreaRequest, devicesFromSettings, type AreaApi } from './ipc/area-handlers';
import { registerGlobalShortcuts } from './shell/global-shortcuts';
import { createRecordingControl } from './shell/recording-control';
import { createShell } from './shell/shell-controller';
import { createWindowStateTracker } from './shell/window-state-tracker';
import { createMainWindow, MAIN_WINDOW_DEFAULT, MAIN_WINDOW_MINIMUM } from './windows/main-window';

// Groups the taskbar buttons and keeps the icon on pinned shortcuts. Same id as the installer.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// At startup Chromium looks up a host called wpad to find a proxy configuration. That is a name
// lookup nobody asked for, in an app that promises no network during recording. With no proxy
// there is no lookup. It must be set before the app is ready. The optional update check will need
// its own session if it has to use the system proxy (see docs/adr/0006-no-proxy-lookup.md).
app.commandLine.appendSwitch('no-proxy-server');

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

  // The settings store exists once the app is ready. Until then the tray has nothing to start.
  let settings: SettingsStore | undefined;

  // The shell sees the recording engine only through this control. End to end tests swap in a fake
  // that they drive from the main process, which can never happen in a packaged app.
  const control = createRecordingControl({
    startOptions: () => {
      const saved = settings?.get();
      return {
        source: { kind: 'display' },
        camera: {
          enabled: saved?.cameraOn ?? false,
          ...(saved?.cameraDeviceId == null ? {} : { deviceId: saved.cameraDeviceId }),
        },
        mic: {
          enabled: saved?.micOn ?? false,
          ...(saved?.micDeviceId == null ? {} : { deviceId: saved.micDeviceId }),
        },
        ...(saved?.destinationFolder == null ? {} : { destination: saved.destinationFolder }),
      };
    },
  });
  const useFakeRecorder = !app.isPackaged && process.env['SCRIM_E2E'] === '1';
  const fake = createStubRecorder();
  if (useFakeRecorder) (globalThis as { __scrimRecorder?: unknown }).__scrimRecorder = fake;
  const recorder = useFakeRecorder ? fake : control;
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
    const logger = createAppLogger();
    logger.info('app.start', { version: app.getVersion(), platform: process.platform });
    const recording = registerRecording({ appOrigin: target.origin });
    control.attach(recording);
    // The main window steps aside while recording and the small control takes over, then they swap back.
    const pillFile = join(app.getPath('userData'), 'pill-position.json');
    const pill = createPillController({
      service: recording,
      window: createPillWindow({
        appOrigin: target.origin,
        recordedArea: () => recording.recordedArea(),
        loadPosition: async () => JSON.parse(await readFile(pillFile, 'utf8')) as unknown,
        savePosition: (point) => writeFile(pillFile, JSON.stringify(point)),
        onAction: (action) => {
          void pill.handle(action);
        },
        log: (message) => {
          logger.info('pill', { message });
        },
      }),
      trash: (folder) => electronShell.trashItem(folder),
      log: (message) => {
        logger.info('pill', { message });
      },
    });
    const recordingWindows = createRecordingWindows({
      minimizeMain: () => {
        shell.beginRecordingMark();
      },
      showControl: () => {
        pill.open();
      },
      closeControl: () => {
        pill.close();
      },
      showMain: () => {
        shell.endRecordingMark();
      },
    });
    recording.on((event) => {
      pill.onEvent(event);
      recordingWindows.onEvent(event);
    });
    // The main window steps aside while the area is chosen and comes back unless a recording began.
    const picker = createAreaPicker({
      appOrigin: target.origin,
      service: recording,
      beforeOpen: () => {
        shell.minimize();
        return Promise.resolve();
      },
    });
    const area: AreaApi = {
      run: async (request) => {
        const outcome = await picker.run(request);
        if (!(outcome.ok && outcome.mode === 'record')) shell.show();
        return outcome;
      },
      cancel: () => {
        picker.cancel();
      },
    };
    settings = await startIpc({ appOrigin: target.origin, logger, recording, area });
    const runArea = async (mode: 'record' | 'screenshot'): Promise<void> => {
      const saved = settings?.get();
      if (saved === undefined) return;
      await area.run(
        buildAreaRequest(
          { mode, ...devicesFromSettings(saved) },
          saved,
          join(app.getPath('pictures'), 'Scrim'),
        ),
      );
    };
    // Start and stop from any app. A key another program owns is logged, and the buttons still work.
    const shortcuts = registerGlobalShortcuts({
      api: globalShortcut,
      actions: {
        isRecording: () => control.isRecording(),
        record: () => runArea('record'),
        screenshot: () => runArea('screenshot'),
        stop: () => control.stopAndSave(),
      },
      onError: (id, error) => {
        logger.error('shortcut.failed', {
          id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      },
    });
    if (shortcuts.unavailable.length > 0)
      logger.warn('shortcut.unavailable', { ids: shortcuts.unavailable });
    app.on('will-quit', () => {
      shortcuts.dispose();
    });
    shell.start();
    await openMainWindow();
  });
}
