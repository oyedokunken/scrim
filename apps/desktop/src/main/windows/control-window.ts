import { screen, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createAppWindow } from './create-window';

export const CONTROL_WINDOW = { width: 312, height: 64 } as const;

/** Where the control sits: centered at the top of the display the pointer is on. */
export function controlPosition(workArea: { x: number; y: number; width: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.round(workArea.x + (workArea.width - CONTROL_WINDOW.width) / 2),
    y: workArea.y + 12,
  };
}

export interface ControlWindow {
  show: () => void;
  close: () => void;
}

/**
 * The small window with the timer, pause and stop. It is always on top, stays out of the taskbar,
 * and is hidden from screen capture, so it never appears in the recording it controls. It has no
 * close button of its own, and the system cannot close it while a recording runs: the recording
 * ends with Stop, and then this window goes away.
 */
export function createControlWindow(rendererUrl: string): ControlWindow {
  let window: BrowserWindow | null = null;
  let allowClose = false;

  return {
    show() {
      if (window !== null && !window.isDestroyed()) {
        window.showInactive();
        return;
      }
      allowClose = false;
      const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const created = createAppWindow(
        {
          ...CONTROL_WINDOW,
          ...controlPosition(workArea),
          // A small bar with its own buttons. It is not the app window, so it has no title bar.
          frame: false,
          transparent: true,
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          alwaysOnTop: true,
          show: false,
          hasShadow: false,
          webPreferences: { preload: join(__dirname, '../preload/index.js') },
        },
        'helper',
      );
      created.setAlwaysOnTop(true, 'screen-saver');
      // Windows leaves a window with this flag out of every capture, including the one in progress.
      created.setContentProtection(true);
      created.on('close', (event) => {
        if (!allowClose) event.preventDefault();
      });
      created.once('ready-to-show', () => {
        created.showInactive();
      });
      void created.loadURL(`${rendererUrl}#/control`);
      window = created;
    },
    close() {
      allowClose = true;
      if (window !== null && !window.isDestroyed()) window.destroy();
      window = null;
    },
  };
}
