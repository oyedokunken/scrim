import { BrowserWindow, screen } from 'electron';
import { createAreaFlow, type AreaOutcome, type AreaRequest, type DisplayInfo } from './area-flow';
import { createOverlayOpener } from './area-window';
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
}): AreaPicker {
  const log = (message: string): void => {
    console.error(message);
  };
  const takeScreenshot = createScreenshotTaker();
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
    takeScreenshot,
    ...(options.beforeOpen === undefined ? {} : { beforeOpen: options.beforeOpen }),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  });
}
