import {
  app,
  BrowserWindow,
  globalShortcut,
  protocol,
  screen,
  session,
  shell as electronShell,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_ID, APP_NAME } from '../shared/app-id';
import { devDockIconPath } from './app-icon';
import { handleAppRequest } from './app-protocol';
import { exportFallbackFolder, previewFolder } from './export/register';
import { handleMediaRequest } from './media/media-protocol';
import { MEDIA_SCHEME, MediaRegistry } from './media/media-registry';
import { currentPlatform } from './platform/platform';
import { portalCapture } from './recording/portal-instance';
import { buildCsp } from './csp';
import { hardenSession, hardenWebContents } from './harden';
import { screenshotFolderOf } from './ipc/handlers';
import { broadcastScreenshotTaken, createAppLogger, sendCloseRequest, startIpc } from './ipc/start';
import { createCloseAsker } from './shell/close-asker';
import { registerRecording } from './recording';
import { createPillController } from './recording/pill-controller';
import { createBubbleController } from './recording/bubble-controller';
import { BUBBLE_DIAMETERS, cornerFromSetting } from '../recorder/bubble/geometry';
import { createBubbleWindow } from './recording/bubble-window';
import { createMediaState, mediaErrorOf, mediaFromSnapshot } from './recording/media-state';
import { PILL_SIZE } from './recording/pill-position';
import { createPillWindow } from './recording/pill-window';
import type { SettingsStore } from './settings/settings-store';
import { APP_SCHEME, resolveRendererTarget } from './renderer-target';
import { applyApplicationMenu } from './shell/menu';
import { createStubRecorder } from './shell/recorder-control';
import { createRecordingWindows } from './shell/recording-windows';
import { createAreaPicker } from './recording/area-picker';
import { buildAreaRequest, devicesFromSettings, type AreaApi } from './ipc/area-handlers';
import { acceleratorsOf } from '../shared/shortcut-keys';
import { autoRender, registerExport } from './export/register';
import { createRealBackgroundStore } from './backgrounds/real-store';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { createShortcutManager } from './shell/shortcut-manager';
import { createRecordingControl, isLivePhase } from './shell/recording-control';
import { createShell } from './shell/shell-controller';
import { createWindowStateTracker } from './shell/window-state-tracker';
import { createMainWindow, MAIN_WINDOW_DEFAULT, MAIN_WINDOW_MINIMUM } from './windows/main-window';

const platform = currentPlatform();

// Groups the taskbar buttons and keeps the icon on pinned shortcuts. Same id as the installer.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// At startup Chromium looks up a host called wpad to find a proxy configuration. That is a name
// lookup nobody asked for, in an app that promises no network during recording. With no proxy
// there is no lookup. It must be set before the app is ready. The optional update check will need
// its own session if it has to use the system proxy (see docs/adr/0006-no-proxy-lookup.md).
app.commandLine.appendSwitch('no-proxy-server');

// On a Wayland session these let Electron run natively and capture the screen through the
// PipeWire portal. There are none on any other system. They must be set before the app is ready.
for (const [name, value] of platform.startupSwitches) {
  if (value === undefined) app.commandLine.appendSwitch(name);
  else app.commandLine.appendSwitch(name, value);
}

// Sandbox every renderer, including any window or frame created later. Must run before ready.
app.enableSandbox();

// Must run before the app is ready. The scheme is secure and standard so the page behaves like
// an https origin, and so the CSP and the permission checks have a real origin to match.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
  // Recordings and their working copies are played from here. The scheme serves only files the
  // main process handed out an address for, inside the projects and cache folders.
  {
    scheme: MEDIA_SCHEME,
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
  // The close question shows in the app's own dialog, and falls back to the system box if the page cannot.
  const closeAsker = createCloseAsker({
    send: (trayAvailable) => sendCloseRequest(target.origin, trayAvailable),
  });
  const shell = createShell({
    askInApp: (trayAvailable) => closeAsker.ask(trayAvailable),
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
    const media = new MediaRegistry(
      () => [
        platform.folders.projectsRoot(app.getPath('userData')),
        previewFolder(),
        // The finished videos, so the Library can play them. Only files the Library names are served.
        settings?.get().destinationFolder ?? platform.folders.recordings(app.getPath('videos')),
        exportFallbackFolder(),
      ],
      process.platform === 'win32',
    );
    session.defaultSession.protocol.handle(MEDIA_SCHEME, (request) =>
      handleMediaRequest(request, media),
    );
    hardenSession({
      appOrigin: target.origin,
      devCsp: target.kind === 'dev' ? buildCsp({ packaged: false }) : undefined,
    });
    const logger = createAppLogger();
    logger.info('app.start', { version: app.getVersion(), platform: process.platform });
    const recording = registerRecording({ appOrigin: target.origin });
    // Every finished recording, a recovered one too, becomes one MP4 in the recordings folder.
    const backgrounds = createRealBackgroundStore();
    const exporter = await registerExport({
      settings: () => settings?.get() ?? DEFAULT_SETTINGS,
      backgroundPath: (id) => backgrounds.pathOf(id),
      log: (message) => {
        logger.info('export', { message });
      },
    });
    autoRender(recording, exporter.service);
    control.attach(recording);
    // The main window steps aside while recording and the small control takes over, then they swap back.
    const pillFile = join(app.getPath('userData'), 'pill-position.json');
    // The microphone and camera buttons. Their state lives here, and the pill and the bubble
    // follow it. `pill` and `bubble` are made below and are only used once a recording runs.
    const pillMedia = createMediaState({
      now: () => performance.now(),
      apply: async (kind, enabled) => {
        const result = await recording.setTrackEnabled(kind, enabled);
        return result.ok ? { ok: true } : { ok: false, reason: mediaErrorOf(result.error.detail) };
      },
      onChange: (state) => {
        pill.refresh();
        bubble.setMedia({
          micMuted: state.mic.available && !state.mic.active,
          cameraOn: !state.camera.available || state.camera.active,
        });
      },
    });
    const pill = createPillController({
      service: recording,
      media: pillMedia,
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
    // The live camera bubble, for a recording that has the camera on. It opens when recording
    // begins and closes when the recording is no longer live, for any reason.
    const bubble = createBubbleController({
      window: createBubbleWindow({
        appOrigin: target.origin,
        log: (message) => {
          logger.info('bubble', { message });
        },
      }),
      devices: () => recording.recordingDevices(),
      look: () => {
        const saved = settings?.get();
        return {
          corner: cornerFromSetting(saved?.bubbleCorner ?? 'bottom-right'),
          size: BUBBLE_DIAMETERS[saved?.bubbleSize ?? 'M'],
          shape: saved?.bubbleShape ?? 'circle',
        };
      },
      area: (displayId) => {
        const id = displayId ?? recording.recordedArea()?.displayId;
        const display =
          screen.getAllDisplays().find((candidate) => String(candidate.id) === id) ??
          screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        // Bottom corners stay clear of the recording pill, which sits in the bottom left.
        return { workArea: display.workArea, bottomInset: PILL_SIZE.height + 12 };
      },
      cursor: () => screen.getCursorScreenPoint(),
      now: () => performance.now(),
      timers: {
        setInterval: (callback, ms) => setInterval(callback, ms),
        clearInterval: (handle) => {
          clearInterval(handle as ReturnType<typeof setInterval>);
        },
      },
      record: (keyframe) => {
        recording.recordBubble(keyframe);
      },
    });
    bubble.onCameraFailed((reason) => {
      void pillMedia.fail('camera', mediaErrorOf(reason));
    });
    recording.on((event) => {
      pill.onEvent(event);
      recordingWindows.onEvent(event);
      if (event.type === 'state') {
        const { snapshot } = event;
        if (snapshot.phase === 'recording') bubble.start();
        else if (!isLivePhase(snapshot.phase)) {
          bubble.stop();
          // The source chosen in the system portal belongs to that one recording.
          portalCapture().release();
        }
        if (!isLivePhase(snapshot.phase)) {
          pillMedia.end();
        } else if (snapshot.phase === 'recording' || snapshot.phase === 'paused') {
          const asked = recording.recordingDevices();
          const seen = mediaFromSnapshot(snapshot, {
            mic: asked?.mic.enabled ?? false,
            camera: asked?.camera.enabled ?? false,
          });
          if (!pillMedia.isLive()) pillMedia.begin(seen.devices);
          for (const kind of seen.lost) pillMedia.deviceLost(kind);
        }
      } else if (event.type === 'finished' || event.type === 'error') {
        bubble.stop();
        pillMedia.end();
      }
    });
    // The main window steps aside while the area is chosen and comes back unless a recording began.
    const picker = createAreaPicker({
      appOrigin: target.origin,
      service: recording,
      log: (message) => {
        logger.info('area', { message });
      },
      preview: {
        show: (input) => {
          bubble.preview({
            displayId: input.displayId,
            camera: { deviceId: input.camera.deviceId },
            mic: input.mic,
          });
        },
        hide: () => {
          bubble.endPreview();
        },
      },
      beforeOpen: () => {
        shell.minimize();
        return Promise.resolve();
      },
    });
    const area: AreaApi = {
      run: async (request) => {
        let outcome = await picker.run(request);
        // One quiet second try: a display that was mid change or a page that was slow to start often works the next time.
        if (!outcome.ok && outcome.reason === 'failed') {
          logger.info('area', { message: `retrying after ${outcome.step ?? 'a failure'}` });
          await new Promise((resolve) => setTimeout(resolve, 400));
          outcome = await picker.run(request);
        }
        if (!(outcome.ok && outcome.mode === 'record')) shell.show();
        if (outcome.ok && outcome.mode === 'screenshot') {
          // The result view opens in the main window for the button and for the shortcut alike.
          broadcastScreenshotTaken(target.origin, {
            ...(outcome.result.path === undefined ? {} : { path: outcome.result.path }),
            ...(outcome.result.saveError === undefined
              ? {}
              : {
                  saveError: {
                    code: outcome.result.saveError.code,
                    message: outcome.result.saveError.message,
                    nextStep: outcome.result.saveError.nextStep,
                  },
                }),
            width: outcome.result.width,
            height: outcome.result.height,
          });
        }
        return outcome;
      },
      cancel: () => {
        picker.cancel();
      },
    };
    const shortcutsRef: { current: ReturnType<typeof createShortcutManager> | undefined } = {
      current: undefined,
    };
    settings = await startIpc({
      appOrigin: target.origin,
      logger,
      recording,
      area,
      exporter,
      media,
      backgrounds,
      onSettingsChanged: (next) => {
        shortcutsRef.current?.apply(acceleratorsOf(next));
      },
      shortcutStatus: () => shortcutsRef.current?.unavailable() ?? [],
      closeAnswer: (answer) => {
        closeAsker.answer(answer);
      },
      shortcutsSuspend: (suspended) => {
        shortcutsRef.current?.suspend(suspended);
      },
    });
    const runArea = async (mode: 'record' | 'screenshot'): Promise<void> => {
      const saved = settings?.get();
      if (saved === undefined) return;
      await area.run(
        buildAreaRequest(
          { mode, ...devicesFromSettings(saved) },
          saved,
          screenshotFolderOf(saved, platform.folders.screenshots(app.getPath('pictures'))),
        ),
      );
    };
    // Start and stop from any app. A key another program owns is logged, and the buttons still work.
    // Changing a key in the settings registers the new one at once.
    const shortcuts = createShortcutManager({
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
      log: (event, ids) => {
        logger.warn(event, { ids: ids.join(',') });
      },
    });
    shortcutsRef.current = shortcuts;
    shortcuts.apply(acceleratorsOf(settings.get()));
    app.on('will-quit', () => {
      shortcuts.dispose();
    });
    shell.start();
    await openMainWindow();
  });
}
