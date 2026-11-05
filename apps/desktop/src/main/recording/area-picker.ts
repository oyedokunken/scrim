import { BrowserWindow, screen } from 'electron';
import { currentPlatform } from '../platform/platform';
import {
  createAreaFlow,
  type AreaDeps,
  type AreaOutcome,
  type AreaRequest,
  type DisplayInfo,
} from './area-flow';
import { portalCapture } from './portal-instance';
import { createStillAreaRunner, stillDisplay } from './still-area';
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
    /** Right before capture starts. */
    beforeStart?: () => void;
  };
}): AreaPicker {
  const log =
    options.log ??
    ((message: string): void => {
      console.error(message);
    });
  const platform = currentPlatform();
  const portal = platform.capture.mode === 'portal';
  // On a portal session the picture is the still the person already picked, never a new capture.
  const takeScreenshot = createScreenshotTaker(
    portal ? { stillOf: () => portalCapture().picked()?.source.thumbnail } : {},
  );
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const deps: AreaDeps = {
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
      : {
          showPreview: options.preview.show,
          hidePreview: options.preview.hide,
          ...(options.preview.beforeStart === undefined
            ? {}
            : { beforeStart: options.preview.beforeStart }),
        }),
    wait,
    log,
    captureDelayMs: platform.capture.settleMs,
  };
  const overlayFlow = createAreaFlow(deps);
  if (platform.capture.areaChooser !== 'still-frame') return overlayFlow;

  // Wayland: the portal picks, then Scrim's own window shows a still frame to draw the box on.
  let active: { cancel: () => void } | undefined;
  const runner = createStillAreaRunner({
    pick: () => {
      const largest = screen.getAllDisplays().reduce(
        (size, display) => ({
          width: Math.max(size.width, Math.round(display.bounds.width * display.scaleFactor)),
          height: Math.max(size.height, Math.round(display.bounds.height * display.scaleFactor)),
        }),
        { width: 1, height: 1 },
      );
      return portalCapture().pick(largest);
    },
    ...(options.beforeOpen === undefined ? {} : { beforeOpen: options.beforeOpen }),
    chooseOnStill: (picked, request) => {
      const real =
        currentDisplays().find((display) => display.id === picked.source.display_id) ??
        currentDisplays().find((display) => display.id === String(screen.getPrimaryDisplay().id)) ??
        currentDisplays()[0];
      if (real === undefined) {
        return Promise.resolve<AreaOutcome>({ ok: false, reason: 'failed', step: 'no-displays' });
      }
      const display = stillDisplay(picked, real);
      const flow = createAreaFlow({
        ...deps,
        displays: () => [display],
        openOverlay: createOverlayOpener({
          appOrigin: options.appOrigin,
          log,
          still: { png: picked.still, size: { width: picked.width, height: picked.height } },
        }),
        listWindows: () => Promise.resolve([]),
      });
      active = flow;
      return flow.run(request).finally(() => {
        active = undefined;
      });
    },
    useWindow: async (picked, request) => {
      const source = { kind: 'window' as const, sourceId: picked.source.id };
      if (request.mode === 'screenshot') {
        const taken = await takeScreenshot(source, {
          folder: request.folder,
          copyToClipboard: request.copyToClipboard ?? true,
        });
        return taken.ok
          ? { ok: true, mode: 'screenshot', result: taken.value }
          : { ok: false, reason: 'rejected', error: taken.error };
      }
      const started = await options.service.start({
        source,
        camera: request.camera,
        mic: request.mic,
        destination: request.destination,
        name: request.name,
        style: request.style,
      });
      return started.ok
        ? { ok: true, mode: 'record', folder: started.value.folder }
        : { ok: false, reason: 'rejected', error: started.error };
    },
    release: () => {
      portalCapture().release();
    },
    log,
  });
  return {
    run: (request) => runner.run(request),
    cancel: () => {
      active?.cancel();
    },
  };
}
