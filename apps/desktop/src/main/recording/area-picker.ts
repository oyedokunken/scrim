import { BrowserWindow, screen } from 'electron';
import { createAreaFlow, type AreaOutcome, type AreaRequest, type DisplayInfo } from './area-flow';
import { createOverlayOpener } from './area-window';
import { hideOwnWindows } from './hide-own-windows';
import type { RecordingService } from './recording-service';
import { createScreenshotTaker } from './screenshot-taker';
import { listWindowTiles } from './sources';

export interface AreaPicker {
  /** Shows the overlays and resolves when something was recorded or photographed, or cancelled. */
  run(request: AreaRequest): Promise<AreaOutcome>;
  cancel(): void;
}

function currentDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
  }));
}

/**
 * The area chooser for the home screen and the shortcuts: one overlay per display, Region, Window
 * or Full screen, then a countdown and the recording, or a screenshot on release. `beforeOpen` is
 * where the main window steps aside, so it is never in the picture.
 */
export function createAreaPicker(options: {
  appOrigin: string;
  service: Pick<RecordingService, 'start'>;
  beforeOpen?: () => Promise<void>;
  /** Where messages go. The standard error stream when left out. */
  log?: (message: string) => void;
  /** The camera bubble shown while the area is chosen, before the countdown. */
  preview?: {
    show: NonNullable<Parameters<typeof createAreaFlow>[0]['showPreview']>;
    hide: () => void;
  };
}): AreaPicker {
  const log =
    options.log ??
    ((message: string): void => {
      console.error(message);
    });
  const takeScreenshot = createScreenshotTaker();
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  return createAreaFlow({
    displays: currentDisplays,
    pointerDisplayId: () => String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id),
    openOverlay: createOverlayOpener({ appOrigin: options.appOrigin, log }),
    listWindows: () =>
      listWindowTiles({
        ownSourceIds: () =>
          new Set(
            BrowserWindow.getAllWindows()
              .filter((window) => !window.isDestroyed())
              .map((window) => window.getMediaSourceId()),
          ),
      }),
    startRecording: (recording) => options.service.start(recording),
    // Every Scrim window is off the screen before the picture is taken, and back afterwards.
    takeScreenshot: async (source, shotOptions) => {
      const restore = await hideOwnWindows({
        windows: () =>
          BrowserWindow.getAllWindows().map((window) => ({
            window,
            overlay: window.isDestroyed()
              ? false
              : window.webContents.getURL().includes('region.html'),
          })),
        wait,
        now: () => performance.now(),
        log,
      });
      try {
        return await takeScreenshot(source, shotOptions);
      } finally {
        restore();
      }
    },
    ...(options.beforeOpen === undefined ? {} : { beforeOpen: options.beforeOpen }),
    ...(options.preview === undefined
      ? {}
      : { showPreview: options.preview.show, hidePreview: options.preview.hide }),
    wait,
    log,
  });
}
