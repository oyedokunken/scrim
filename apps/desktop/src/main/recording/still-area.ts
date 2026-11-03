import type { Rect } from '../../recorder/region/geometry';
import type { AreaOutcome, AreaRequest, DisplayInfo } from './area-flow';
import type { PickedSource, PortalSource } from './portal-capture';

/**
 * Wayland does not let an app put a full screen window over other apps. So the area chooser works
 * on a still picture instead: the system portal shows its own picker, then Scrim's own full screen
 * window shows a still frame of what was picked, and the person drags the box on that. This file
 * is the logic of that path. The window and the portal are passed in, so it runs on any system.
 */

/**
 * The display the still stands for, as the area flow sees it: the same position and scale as a
 * real display, and the size of the still in device independent pixels. Everything the flow works
 * out from it (the crop, the even pixels) then matches the recorded frame.
 */
export function stillDisplay(
  picked: Pick<PickedSource<PortalSource>, 'width' | 'height'>,
  real: DisplayInfo,
): DisplayInfo {
  return {
    id: real.id,
    bounds: {
      x: real.bounds.x,
      y: real.bounds.y,
      width: picked.width / real.scaleFactor,
      height: picked.height / real.scaleFactor,
    },
    scaleFactor: real.scaleFactor,
  };
}

/**
 * A box drawn in the chooser window, as a box on the still. The window may not be the size of the
 * still, so the box is scaled by the ratio of the two. The page only says where in its window the
 * box is, as it always does.
 */
export function scaleBox(
  box: Rect,
  windowSize: { width: number; height: number },
  stillSize: { width: number; height: number },
): Rect {
  if (windowSize.width <= 0 || windowSize.height <= 0) return box;
  const fx = stillSize.width / windowSize.width;
  const fy = stillSize.height / windowSize.height;
  return { x: box.x * fx, y: box.y * fy, width: box.width * fx, height: box.height * fy };
}

export interface StillAreaDeps {
  /** Shows the portal picker. Undefined when the person cancels. */
  pick: () => Promise<PickedSource<PortalSource> | undefined>;
  /** Runs before anything shows, so the main window can step aside. */
  beforeOpen?: () => Promise<void>;
  /** Runs the normal area flow on a still: the chooser, the countdown, the recording or the shot. */
  chooseOnStill: (picked: PickedSource<PortalSource>, request: AreaRequest) => Promise<AreaOutcome>;
  /** The person picked a whole window in the portal: record or photograph it without a box. */
  useWindow: (picked: PickedSource<PortalSource>, request: AreaRequest) => Promise<AreaOutcome>;
  /** Forgets the picked source when the flow did not hand it to a recording. */
  release: () => void;
  log: (message: string) => void;
}

/** The area chooser of a Wayland session. Same call and same outcomes as the overlay chooser. */
export function createStillAreaRunner(deps: StillAreaDeps): {
  run(request: AreaRequest): Promise<AreaOutcome>;
} {
  let running = false;
  return {
    async run(request) {
      if (running) return { ok: false, reason: 'busy' };
      running = true;
      try {
        await deps.beforeOpen?.();
        const picked = await deps.pick();
        if (picked === undefined) {
          deps.log('area.still cancelled in the portal');
          return { ok: false, reason: 'cancelled' };
        }
        const outcome =
          picked.kind === 'window'
            ? await deps.useWindow(picked, request)
            : await deps.chooseOnStill(picked, request);
        // A recording keeps the source until it ends. Anything else lets it go.
        if (!(outcome.ok && outcome.mode === 'record')) deps.release();
        return outcome;
      } catch (error) {
        deps.release();
        deps.log(`area.still failed ${error instanceof Error ? error.name : typeof error}`);
        return { ok: false, reason: 'failed', step: 'overlay-open' };
      } finally {
        running = false;
      }
    },
  };
}
