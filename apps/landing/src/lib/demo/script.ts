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
export const DEMO_DURATION_MS = 18_000;

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
 * The cursor path. Six clicks, and the pretend app answers each: the Filter button opens a menu,
 * a menu item picks a filter, two tasks are ticked off, Save shows a message and the search box
 * takes a typed word. The first two clicks are close in time, so the camera pans between them
 * instead of zooming out and back in. The rest are far enough apart for a full zoom out, which
 * shows both behaviors of the planner.
 */
export const DEMO_WAYPOINTS: readonly Waypoint[] = [
  { t: 0, x: 640, y: 360 },
  { t: 800, x: 520, y: 230 },
  { t: 1500, x: 330, y: 88, click: true },
  { t: 2400, x: 350, y: 150 },
  { t: 3300, x: 360, y: 202, click: true },
  { t: 4500, x: 520, y: 300 },
  { t: 6000, x: 700, y: 374, click: true },
  { t: 7200, x: 640, y: 400 },
  { t: 8400, x: 700, y: 462, click: true },
  { t: 9800, x: 900, y: 520 },
  { t: 11_000, x: 1110, y: 648, click: true },
  { t: 12_400, x: 1000, y: 300 },
  { t: 14_000, x: 1000, y: 88, click: true },
  { t: 15_500, x: 900, y: 200 },
  { t: 16_800, x: 640, y: 360 },
  { t: 18_000, x: 640, y: 360 },
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

/** Eases a value from 0 to 1 over `duration` milliseconds, starting at `start`. */
export function ramp(timeMs: number, start: number, duration: number): number {
  const progress = Math.min(1, Math.max(0, (timeMs - start) / duration));
  return progress * progress * (3 - 2 * progress);
}

/** How far each reaction in the pretend app has played, from 0 (hidden) to 1 (shown). */
export interface UiState {
  /** The filter menu that opens after the first click. */
  menu: number;
  /** The Filter button turning green once a filter is chosen. */
  chip: number;
  /** The tick on the second task. */
  checked: number;
  /** The tick on the third task. */
  checkedMore: number;
  /** The "Changes saved" message after Save. */
  toast: number;
  /** The search box taking focus. */
  search: number;
}

/** When the app tidies itself for the next loop, so the start of every loop is clean. */
const RESET_AT_MS = 17_000;
const RESET_FOR_MS = 500;

/** What the pretend app shows at a time in the loop. Each reaction follows its click. */
export function uiStateAt(timeMs: number): UiState {
  const reset = 1 - ramp(timeMs, RESET_AT_MS, RESET_FOR_MS);
  return {
    menu: ramp(timeMs, 1520, 140) * (1 - ramp(timeMs, 3320, 200)),
    chip: ramp(timeMs, 3340, 200) * reset,
    checked: ramp(timeMs, 6020, 180) * reset,
    checkedMore: ramp(timeMs, 8420, 180) * reset,
    toast: ramp(timeMs, 11_020, 200) * (1 - ramp(timeMs, 12_800, 300)),
    search: ramp(timeMs, 14_020, 150) * reset,
  };
}

/** The word typed into the search box, a letter at a time after it takes focus. */
export const SEARCH_WORD = 'release';
const TYPING_START_MS = 14_250;
const TYPING_STEP_MS = 140;

/** How many letters of the search word are on screen at a time in the loop. */
export function typedCount(timeMs: number): number {
  if (timeMs < TYPING_START_MS || timeMs >= RESET_AT_MS) {
    return 0;
  }
  return Math.min(SEARCH_WORD.length, 1 + Math.floor((timeMs - TYPING_START_MS) / TYPING_STEP_MS));
}

export interface Span {
  start: number;
  end: number;
}

/**
 * The stretches of the loop where the camera is zoomed in, from the start of each zoom in to the
 * end of its zoom out. The timeline draws these as the zoom regions.
 */
export function zoomSpans(keyframes: readonly CameraKeyframe[]): Span[] {
  const spans: Span[] = [];
  let start: number | null = null;
  keyframes.forEach((keyframe, index) => {
    if (keyframe.pose.scale > 1 && start === null) {
      start = keyframes[index - 1]?.t ?? keyframe.t;
    } else if (keyframe.pose.scale === 1 && start !== null) {
      spans.push({ start, end: keyframe.t });
      start = null;
    }
  });
  return spans;
}

export const DEMO_ZOOM_SPANS: readonly Span[] = zoomSpans(DEMO_KEYFRAMES);

export { formatClock } from '../clock';
