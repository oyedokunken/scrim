import { toEvenPixels, type Rect } from '../../recorder/region/geometry';
import { regionEventSchema, type RegionCommand } from '../../recorder/region/protocol';

export interface DisplayInfo {
  /** The system's id for the display, as text. The recording service uses the same one. */
  id: string;
  /** Position and size on the desktop, in device independent pixels. */
  bounds: Rect;
  scaleFactor: number;
}

/** One overlay window, as the selector sees it. The real one wraps a BrowserWindow. */
export interface OverlayHandle {
  onEvent(callback: (value: unknown) => void): void;
  /** The window closed, by the person or because the display went away. */
  onClosed(callback: () => void): void;
  send(command: RegionCommand): void;
  focus(): void;
  close(): void;
}

export interface RegionDeps {
  displays(): DisplayInfo[];
  openOverlay(display: DisplayInfo): OverlayHandle;
  log(message: string): void;
  /** How long to wait for the first overlay to show before giving up. */
  readyTimeoutMs?: number;
}

interface ChosenRegion {
  displayId: string;
  /** The area in device independent pixels on the desktop, on the pixel grid, even in pixels. */
  crop: Rect;
  /** The size of the recording in physical pixels. Always even. */
  sizePx: { width: number; height: number };
}

export type RegionOutcome =
  { ok: true; value: ChosenRegion } | { ok: false; reason: 'cancelled' | 'failed' | 'busy' };

const DEFAULT_READY_TIMEOUT_MS = 10_000;

/**
 * Lets the person drag a box on any display. One transparent overlay covers each display. Drawing
 * on one clears the box on the others, Enter confirms and Escape cancels. What comes back is
 * worked out here, from the display's own position and scale, and not taken from the page: the
 * page only says where in its window the box is. Only one selection runs at a time.
 */
export function createRegionSelector(deps: RegionDeps): {
  select(): Promise<RegionOutcome>;
  cancel(): void;
} {
  let running: { finish: (outcome: RegionOutcome) => void } | undefined;

  return {
    select() {
      if (running !== undefined)
        return Promise.resolve<RegionOutcome>({ ok: false, reason: 'busy' });
      const displays = deps.displays();
      if (displays.length === 0)
        return Promise.resolve<RegionOutcome>({ ok: false, reason: 'failed' });

      return new Promise<RegionOutcome>((resolve) => {
        const overlays: { display: DisplayInfo; handle: OverlayHandle }[] = [];
        let done = false;
        let anyReady = false;
        const timer = setTimeout(() => {
          if (!anyReady) {
            deps.log('No region overlay appeared in time.');
            finish({ ok: false, reason: 'failed' });
          }
        }, deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

        function finish(outcome: RegionOutcome): void {
          if (done) return;
          done = true;
          clearTimeout(timer);
          running = undefined;
          for (const { handle } of overlays) {
            try {
              handle.close();
            } catch (error) {
              deps.log(`An overlay did not close cleanly: ${String(error)}`);
            }
          }
          resolve(outcome);
        }
        running = { finish };

        for (const display of displays) {
          let handle: OverlayHandle;
          try {
            handle = deps.openOverlay(display);
          } catch (error) {
            deps.log(`An overlay could not be opened: ${String(error)}`);
            finish({ ok: false, reason: 'failed' });
            return;
          }
          const entry = { display, handle };
          overlays.push(entry);

          handle.onClosed(() => {
            finish({ ok: false, reason: 'cancelled' });
          });
          handle.onEvent((value) => {
            const parsed = regionEventSchema.safeParse(value);
            if (!parsed.success) {
              deps.log('Ignored a region event that did not match the schema.');
              return;
            }
            const event = parsed.data;
            switch (event.type) {
              case 'ready':
                anyReady = true;
                return;
              case 'begin':
                for (const other of overlays) {
                  if (other !== entry) other.handle.send({ type: 'clear' });
                }
                return;
              case 'cancel':
                finish({ ok: false, reason: 'cancelled' });
                return;
              case 'confirm': {
                const region = toEvenPixels(event.rect, display.scaleFactor, {
                  width: display.bounds.width,
                  height: display.bounds.height,
                });
                if (region === undefined) return;
                finish({
                  ok: true,
                  value: {
                    displayId: display.id,
                    crop: {
                      x: display.bounds.x + region.dip.x,
                      y: display.bounds.y + region.dip.y,
                      width: region.dip.width,
                      height: region.dip.height,
                    },
                    sizePx: { width: region.px.width, height: region.px.height },
                  },
                });
              }
            }
          });
        }

        // The display under the pointer gets the keyboard, so Enter and Escape work at once.
        overlays[0]?.handle.focus();
      });
    },
    cancel() {
      running?.finish({ ok: false, reason: 'cancelled' });
    },
  };
}
