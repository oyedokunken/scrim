import {
  app,
  dialog,
  nativeImage,
  screen,
  Tray,
  Menu,
  type BrowserWindow,
  type NativeImage,
} from 'electron';
import { createRecordingMark, redDotBitmap } from './recording-mark';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dialogIconPath } from '../app-icon';
import {
  closeChoice,
  closeDialogCopy,
  decideClose,
  type CloseChoice,
  type CloseDecision,
} from './close-policy';
import type { RecorderControl } from './recorder-control';
import {
  buildTrayMenu,
  chooseTrayIcon,
  isTrayAvailable,
  trayTooltip,
  type TrayAction,
} from './tray-model';

interface ShellOptions {
  recorder: RecorderControl;
  /** Asks in the app's own dialog. Null means it could not, and the system message box is used. */
  askInApp?: (trayAvailable: boolean) => Promise<CloseChoice | null>;
  platform: NodeJS.Platform;
  appPath: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Window lifecycle for the main window: what close does, the close dialog, the tray and the
 * quit path. Closing during a recording never discards anything silently. Every decision is made
 * by a pure function in this folder, so this file only does the Electron calls.
 */
export function createShell({ recorder, platform, appPath, env, askInApp }: ShellOptions) {
  let quitting = false;
  let asking = false;
  let tray: Tray | null = null;
  let trayAvailable = false;
  let mainWindow: BrowserWindow | null = null;

  const iconsDir = join(appPath, 'resources', 'icons');
  const mark = createRecordingMark({
    makeDot: () => nativeImage.createFromBitmap(redDotBitmap(16), { width: 16, height: 16 }),
  });

  function trayImage(recording: boolean): NativeImage {
    const choice = chooseTrayIcon(platform, screen.getPrimaryDisplay().scaleFactor, recording);
    const file = join(iconsDir, choice.file);
    const image =
      choice.scaleFactor === 2
        ? nativeImage.createFromBuffer(readFileSync(file), { scaleFactor: 2 })
        : nativeImage.createFromPath(file);
    image.setTemplateImage(choice.template);
    return image;
  }

  function showWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  async function stopAndQuit(): Promise<void> {
    try {
      await recorder.stopAndSave();
    } catch (error) {
      // The raw files are the source of truth and recovery offers them on the next launch.
      console.error('Stopping the recording before quit failed', error);
    }
    quitting = true;
    app.quit();
  }

  function runTrayAction(action: TrayAction): void {
    if (action === 'show') showWindow();
    else if (action === 'start') void recorder.start().catch(() => undefined);
    else if (action === 'stop') void recorder.stopAndSave().catch(() => undefined);
    else app.quit();
  }

  function refreshTray(): void {
    if (!tray) return;
    const recording = recorder.isRecording();
    tray.setImage(trayImage(recording));
    tray.setToolTip(trayTooltip(recording));
    tray.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenu(recording).map((item) =>
          item.id === 'separator'
            ? { type: 'separator' as const }
            : {
                label: item.label ?? '',
                click: () => {
                  runTrayAction(item.id as TrayAction);
                },
              },
        ),
      ),
    );
  }

  function createTray(): void {
    trayAvailable = false;
    if (!isTrayAvailable(platform, env)) return;
    try {
      tray = new Tray(trayImage(recorder.isRecording()));
      tray.on('click', showWindow);
      trayAvailable = true;
      refreshTray();
    } catch (error) {
      console.error('The tray could not be created', error);
      tray = null;
    }
  }

  function applyKeepRunning(window: BrowserWindow, decision: CloseDecision): void {
    if (decision === 'minimize') window.minimize();
    else window.hide();
  }

  async function askBeforeClosing(window: BrowserWindow): Promise<void> {
    if (asking) return;
    asking = true;
    try {
      const inApp = askInApp === undefined ? null : await askInApp(trayAvailable);
      let choice: CloseChoice;
      if (inApp !== null) {
        choice = inApp;
      } else {
        const copy = closeDialogCopy(trayAvailable);
        const iconPath = dialogIconPath(platform, appPath);
        const { response } = await dialog.showMessageBox(window, {
          type: 'question',
          buttons: [...copy.buttons],
          defaultId: copy.defaultId,
          cancelId: copy.cancelId,
          title: copy.title,
          message: copy.message,
          detail: copy.detail,
          noLink: true,
          ...(iconPath === undefined ? {} : { icon: nativeImage.createFromPath(iconPath) }),
        });
        choice = closeChoice(response);
      }
      if (choice === 'stop') await stopAndQuit();
      else if (choice === 'keep') {
        applyKeepRunning(
          window,
          decideClose({
            platform,
            recording: recorder.isRecording(),
            trayAvailable,
            quitting,
            keepRunning: true,
          }),
        );
      }
    } finally {
      asking = false;
    }
  }

  return {
    /** Hooks the main window. Call once the window exists. */
    attachWindow(window: BrowserWindow): void {
      mainWindow = window;
      window.on('close', (event) => {
        const decision = decideClose({
          platform,
          recording: recorder.isRecording(),
          trayAvailable,
          quitting,
          keepRunning: false,
        });
        if (decision === 'quit') return;
        event.preventDefault();
        if (decision === 'ask') void askBeforeClosing(window);
        else applyKeepRunning(window, decision);
      });
      // Windows only. The system is ending the session and will not wait, so this is best effort.
      window.on('session-end', () => {
        void recorder.stopAndSave().catch(() => undefined);
      });
    },

    /** Call from `app.on('before-quit')`. A recording is stopped and saved before the app exits. */
    beforeQuit(event: { preventDefault: () => void }): void {
      if (quitting) return;
      if (recorder.isRecording()) {
        event.preventDefault();
        void stopAndQuit();
        return;
      }
      quitting = true;
    },

    /** The dock icon was clicked on macOS, or the window was hidden: bring it back. */
    show: showWindow,

    /** Steps the main window aside, so the area chooser and the picture never include it. */
    minimize(): void {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    },

    /** Minimizes the main window for a recording. It keeps its taskbar button, with a red dot. */
    beginRecordingMark(): void {
      mark.begin(mainWindow);
    },

    /** Brings the main window back and removes the dot and the capture exclusion. */
    endRecordingMark(): void {
      mark.end(mainWindow);
    },

    start(): void {
      createTray();
      recorder.onChange(() => {
        refreshTray();
      });
    },
  };
}
