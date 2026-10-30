import { ipcMain } from 'electron';
import { join } from 'node:path';
import { REGION_CHANNELS, type RegionCommand } from '../../recorder/region/protocol';
import { originOf } from '../renderer-target';
import { createAppWindow } from '../windows/create-window';
import type { DisplayInfo, OverlayHandle } from './area-flow';

/** The region page, served next to the app window: `app://scrim/region.html` or the dev server. */
function regionPageUrl(appOrigin: string): string {
  return `${appOrigin}/region.html`;
}

/**
 * Opens one transparent, frameless overlay over a display. It stays above everything, never shows
 * in the taskbar, is hidden from screen capture, and has the same security baseline as every other
 * window. Only events from its own web contents, from our own origin, are passed on.
 */
export function createOverlayOpener(options: {
  appOrigin: string;
  log: (message: string) => void;
}): (display: DisplayInfo) => OverlayHandle {
  return (display) => {
    const { bounds } = display;
    const window = createAppWindow(
      {
        show: false,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
          preload: join(__dirname, '../preload/region.js'),
          backgroundThrottling: false,
        },
      },
      'helper',
    );
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setContentProtection(true);
    const contents = window.webContents;
    const listeners: ((value: unknown) => void)[] = [];
    const closedListeners: (() => void)[] = [];

    const onEvent = (ipcEvent: Electron.IpcMainEvent, payload: unknown): void => {
      if (ipcEvent.sender !== contents) return;
      const origin = ipcEvent.senderFrame === null ? '' : originOf(ipcEvent.senderFrame.url);
      if (origin !== options.appOrigin) {
        options.log('Ignored a region event from an unexpected origin.');
        return;
      }
      for (const listener of listeners) listener(payload);
    };
    ipcMain.on(REGION_CHANNELS.event, onEvent);

    let closing = false;
    window.on('closed', () => {
      ipcMain.off(REGION_CHANNELS.event, onEvent);
      if (!closing) for (const listener of closedListeners) listener();
    });
    contents.on('render-process-gone', () => {
      for (const listener of closedListeners) listener();
    });
    window.once('ready-to-show', () => {
      // Windows sizes a new window to the work area, which leaves the taskbar uncovered. Ask for the
      // whole display again once the window exists, and again after it is shown.
      window.setBounds(bounds);
      window.show();
      window.setBounds(bounds);
    });
    void window.loadURL(regionPageUrl(options.appOrigin)).catch((error: unknown) => {
      options.log(
        `The region page did not load: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      for (const listener of closedListeners) listener();
    });

    return {
      onEvent(callback) {
        listeners.push(callback);
      },
      onClosed(callback) {
        closedListeners.push(callback);
      },
      send(command: RegionCommand) {
        if (!contents.isDestroyed()) contents.send(REGION_CHANNELS.command, command);
      },
      focus() {
        if (!window.isDestroyed()) window.focus();
      },
      close() {
        closing = true;
        if (!window.isDestroyed()) window.destroy();
      },
    };
  };
}
