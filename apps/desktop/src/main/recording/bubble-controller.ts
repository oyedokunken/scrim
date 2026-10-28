import type { BubbleKeyframe } from '@scrim/core';
import {
  BUBBLE,
  cornerPositions,
  dodgeCorner,
  dotSideFor,
  easeBetween,
  nearestCorner,
  type Corner,
  type DotSide,
  type Point,
  type Rect,
} from '../../recorder/bubble/geometry';

/** The window half of the bubble. The controller never touches Electron. */
export interface BubbleWindow {
  open: (input: {
    circle: Point;
    side: DotSide;
    camera: { deviceId?: string | undefined };
    mic: { enabled: boolean; deviceId?: string | undefined };
  }) => void;
  close: () => void;
  /** Puts the window so the round picture's top left is at `circle`, with the dot on `side`. */
  place: (circle: Point, side: DotSide) => void;
  /** The person took hold of the picture. */
  onDragStart: (callback: () => void) => void;
  /** The person let go, with the picture's top left where it is now. */
  onDragEnd: (callback: (circle: Point) => void) => void;
}

export interface BubbleTimers {
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface BubbleDeps {
  window: BubbleWindow;
  /** The camera and microphone of the recording, or nothing when none is running. */
  devices: () =>
    | {
        camera: { enabled: boolean; deviceId?: string | undefined };
        mic: { enabled: boolean; deviceId?: string | undefined };
      }
    | undefined;
  /** The work area of the display being recorded, and extra room to keep free at the bottom. */
  area: () => { workArea: Rect; bottomInset: number };
  cursor: () => Point;
  now: () => number;
  timers: BubbleTimers;
  /** Notes a position for the session file. */
  record: (keyframe: Omit<BubbleKeyframe, 't'>) => void;
}

const WATCH_MS = 80;
const FRAME_MS = 16;

/**
 * The camera bubble while recording. It sits at the bottom left of the recorded display, snaps to
 * the nearest corner when dropped, steps away from the cursor when it comes close, and notes each
 * position it settles at so export draws the camera where it was. It opens only for a recording
 * that has the camera on, and closes the moment the recording is no longer live.
 */
export function createBubbleController(deps: BubbleDeps) {
  let open = false;
  let corner: Corner = 'bl';
  let circle: Point = { x: 0, y: 0 };
  let lastMoveAt = -Infinity;
  let dragging = false;
  let watch: unknown;
  let animation: unknown;

  const positions = (): Record<Corner, Point> => {
    const { workArea, bottomInset } = deps.area();
    return cornerPositions(workArea, bottomInset);
  };

  const note = (): void => {
    deps.record({ corner, x: Math.round(circle.x), y: Math.round(circle.y), size: BUBBLE.size });
  };

  const stopAnimation = (): void => {
    if (animation !== undefined) deps.timers.clearInterval(animation);
    animation = undefined;
  };

  /** Slides to a corner over 200 ms, then settles there and notes it. */
  const moveTo = (target: Corner): void => {
    stopAnimation();
    const from = circle;
    const to = positions()[target];
    const side = dotSideFor(target);
    lastMoveAt = deps.now();
    const startedAt = deps.now();
    animation = deps.timers.setInterval(() => {
      const t = (deps.now() - startedAt) / BUBBLE.moveMs;
      const here = easeBetween(from, to, t);
      circle = here;
      deps.window.place(here, side);
      if (t >= 1) {
        stopAnimation();
        circle = to;
        corner = target;
        deps.window.place(to, side);
        note();
      }
    }, FRAME_MS);
  };

  const watchCursor = (): void => {
    if (!open) return;
    const target = dodgeCorner({
      current: corner,
      positions: positions(),
      cursor: deps.cursor(),
      now: deps.now(),
      lastMoveAt,
      dragging,
    });
    if (target !== undefined && animation === undefined) moveTo(target);
  };

  deps.window.onDragStart(() => {
    dragging = true;
    stopAnimation();
  });
  deps.window.onDragEnd((dropped) => {
    dragging = false;
    if (!open) return;
    circle = dropped;
    moveTo(nearestCorner(dropped, positions()));
  });

  return {
    /** Opens the bubble if the recording that just started has its camera on. */
    start(): void {
      if (open) return;
      const devices = deps.devices();
      if (devices === undefined || !devices.camera.enabled) return;
      open = true;
      corner = 'bl';
      circle = positions()[corner];
      lastMoveAt = deps.now();
      deps.window.open({
        circle,
        side: dotSideFor(corner),
        camera: { deviceId: devices.camera.deviceId },
        mic: devices.mic,
      });
      note();
      watch = deps.timers.setInterval(watchCursor, WATCH_MS);
    },
    /** Closes the bubble. Safe to call again. */
    stop(): void {
      open = false;
      dragging = false;
      stopAnimation();
      if (watch !== undefined) deps.timers.clearInterval(watch);
      watch = undefined;
      deps.window.close();
    },
    isOpen: (): boolean => open,
    /** For tests: where the picture is and which corner it counts as. */
    state: (): { corner: Corner; circle: Point } => ({ corner, circle }),
  };
}
