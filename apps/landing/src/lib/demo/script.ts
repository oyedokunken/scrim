import {
  planZoom,
  type CameraKeyframe,
  type ClickEvent,
  type Frame,
  type InputEvent,
  type InputLog,
} from '@scrim/core/zoom';

/** The size of the pretend screen the demo records, in its own pixels. */
export const DEMO_FRAME: Frame = { width: 1280, height: 720 };

/** One loop of the demo. The cursor ends where it began, so the loop is seamless. */
export const DEMO_DURATION_MS = 10_000;

/** How long a ripple lasts after a click. */
export const RIPPLE_DURATION_MS = 700;

/**
 * The frame shown when the visitor prefers reduced motion. The camera is zoomed in on the first
 * click, which still shows its ripple, so the still image already shows what auto zoom does.
 */
export const STATIC_FRAME_TIME_MS = 1900;

interface Waypoint {
  t: number;
  x: number;
  y: number;
  click?: true;
}

/**
 * The cursor path. Three clicks: one in the toolbar, one on a task row and one on the save button.
 * The second and third are close enough in time that the camera pans across instead of zooming
 * out and back in, which shows both behaviors of the planner.
 */
export const DEMO_WAYPOINTS: readonly Waypoint[] = [
  { t: 0, x: 640, y: 360 },
  { t: 800, x: 520, y: 230 },
  { t: 1500, x: 330, y: 88, click: true },
  { t: 2500, x: 520, y: 260 },
  { t: 3700, x: 620, y: 340 },
  { t: 4800, x: 700, y: 374, click: true },
  { t: 5700, x: 930, y: 520 },
  { t: 6600, x: 1110, y: 648, click: true },
  { t: 8000, x: 880, y: 300 },
  { t: 9400, x: 640, y: 360 },
  { t: 10_000, x: 640, y: 360 },
];

const MOVE_INTERVAL_MS = 40;

function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

function positionAt(t: number): { x: number; y: number } {
  for (let i = 1; i < DEMO_WAYPOINTS.length; i += 1) {
    const from = DEMO_WAYPOINTS[i - 1];
    const to = DEMO_WAYPOINTS[i];
    if (from !== undefined && to !== undefined && t <= to.t) {
      const amount = to.t === from.t ? 1 : smoothstep((t - from.t) / (to.t - from.t));
      return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
    }
  }
  const last = DEMO_WAYPOINTS[DEMO_WAYPOINTS.length - 1];
  return { x: last?.x ?? 0, y: last?.y ?? 0 };
}

/** The scripted input log, in the same shape the desktop app records. */
export function buildDemoLog(): InputLog {
  const events: InputEvent[] = [];
  for (let t = 0; t <= DEMO_DURATION_MS; t += MOVE_INTERVAL_MS) {
    const { x, y } = positionAt(t);
    events.push({ type: 'move', t, x: Math.round(x), y: Math.round(y) });
  }
  for (const waypoint of DEMO_WAYPOINTS) {
    if (waypoint.click === true) {
      events.push({ type: 'click', t: waypoint.t, x: waypoint.x, y: waypoint.y, button: 'left' });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { frame: DEMO_FRAME, events };
}

export const DEMO_LOG: InputLog = buildDemoLog();

export const DEMO_CLICKS: readonly ClickEvent[] = DEMO_LOG.events.filter(
  (event): event is ClickEvent => event.type === 'click',
);

/** The camera plan for the demo, from the real planner with its default options. */
export const DEMO_KEYFRAMES: readonly CameraKeyframe[] = planZoom(DEMO_LOG);
