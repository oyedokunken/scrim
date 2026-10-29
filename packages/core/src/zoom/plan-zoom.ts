import { clampPose, identityPose } from '../camera/camera';
import type { CameraKeyframe, CameraPose } from '../camera/camera';
import type { ClickEvent, Frame, InputEvent, InputLog } from '../input/types';
import { cursorAt } from './cursor';
import type { Point } from './cursor';
import { normalizeMoments } from './moments';
import type { ZoomMoment } from './moments';
import { resolveZoomOptions } from './options';
import type { ZoomOptions } from './options';
import { chain, omegaFor, stepChain } from './spring';

/** The camera is simulated at this step, and a keyframe is written every second step. */
const STEP_MS = 1000 / 120;
const KEYFRAME_EVERY = 2;
/** After the last moment the spring is given this many eases to come to rest. */
const SETTLE_EASES = 2.5;
/** The scale counts as arrived when it is this close to its goal. */
/** Clicks this close to the end of the recording are the click that stopped it. */
const STOP_CLICK_GUARD_MS = 1200;
const SNAP_SCALE = 0.002;

function isLeftClick(event: InputEvent): event is ClickEvent {
  return event.type === 'click' && event.button === 'left';
}

/**
 * Finds the moments to zoom on: one around each left click, joined when the camera could not
 * finish zooming out before the next click needs it back in. A run of nearby clicks therefore
 * stays in one zoom. The first click of a moment is where the camera first aims.
 */
export function planZoomMoments(
  log: InputLog,
  options: Partial<ZoomOptions> = {},
  durationMs?: number,
): ZoomMoment[] {
  const resolved = resolveZoomOptions(options);
  // The last click of a recording is almost always the click on Stop, so it is not a place to zoom.
  const lastUseful = durationMs === undefined ? Infinity : durationMs - STOP_CLICK_GUARD_MS;
  const clicks = log.events
    .filter(isLeftClick)
    .filter((c) => c.t <= lastUseful)
    .sort((a, b) => a.t - b.t);
  if (clicks.length === 0 || resolved.maxZoom === 1) {
    return [];
  }
  const moments: ZoomMoment[] = [];
  for (const click of clicks) {
    const next: ZoomMoment = {
      startMs: Math.max(0, click.t - resolved.leadInMs),
      endMs: click.t + resolved.holdMs,
      x: click.x,
      y: click.y,
    };
    const previous = moments[moments.length - 1];
    if (previous !== undefined && next.startMs < previous.endMs + resolved.easeMs) {
      previous.endMs = Math.max(previous.endMs, next.endMs);
    } else {
      moments.push(next);
    }
  }
  return moments;
}

/**
 * Moves the target center as little as possible so the cursor stays inside the inner part of the
 * view. A cursor that wanders near the middle does not move the camera at all.
 */
function followCursor(
  target: Point,
  cursor: Point,
  frame: Frame,
  scale: number,
  deadZone: number,
): Point {
  const reachX = (frame.width / (2 * scale)) * deadZone;
  const reachY = (frame.height / (2 * scale)) * deadZone;
  return {
    x: Math.min(cursor.x + reachX, Math.max(cursor.x - reachX, target.x)),
    y: Math.min(cursor.y + reachY, Math.max(cursor.y - reachY, target.y)),
  };
}

function samePose(a: CameraPose, b: CameraPose): boolean {
  return (
    Math.abs(a.scale - b.scale) < 1e-4 &&
    Math.abs(a.cx - b.cx) < 0.02 &&
    Math.abs(a.cy - b.cy) < 0.02
  );
}

/**
 * Turns zoom moments into camera keyframes by simulating a critically damped spring that chases
 * a target: full zoom on the aim point while a moment is active, the whole frame otherwise. While
 * zoomed the aim point follows the cursor, a little ahead of the clock, and stays put while the
 * cursor moves inside a dead zone. The result has no corners, never overshoots, and the view
 * stays inside the frame. Keyframes are dense while the camera moves and sparse while it rests,
 * and every segment is linear because the spring already made the motion smooth.
 */
export function planCamera(
  moments: readonly ZoomMoment[],
  log: InputLog,
  options: Partial<ZoomOptions> = {},
): CameraKeyframe[] {
  const resolved = resolveZoomOptions(options);
  const { frame } = log;
  const list = normalizeMoments(moments);
  if (list.length === 0 || resolved.maxZoom === 1) {
    return [];
  }
  const events = [...log.events].sort((a, b) => a.t - b.t);
  const rest = identityPose(frame);
  const omega = omegaFor(resolved.easeMs);
  const settleMs = resolved.easeMs * SETTLE_EASES;
  const keyframes: CameraKeyframe[] = [];

  let index = 0;
  while (index < list.length) {
    const first = list[index];
    if (first === undefined) break;
    // Moments close enough together share one simulation, so the spring keeps its momentum.
    let last = first;
    let end = index;
    for (let i = index + 1; i < list.length; i += 1) {
      const candidate = list[i];
      if (candidate === undefined || candidate.startMs - last.endMs >= settleMs) break;
      last = candidate;
      end = i;
    }
    const group = list.slice(index, end + 1);
    index = end + 1;

    const from = first.startMs;
    const to = last.endMs + settleMs;
    const scale = chain(1);
    const px = chain(rest.cx);
    const py = chain(rest.cy);
    let target: Point = { x: rest.cx, y: rest.cy };
    let activeMoment: ZoomMoment | undefined;
    const hold: { last?: CameraPose | undefined; pending?: CameraKeyframe | undefined } = {};

    const emit = (t: number, pose: CameraPose): void => {
      if (hold.last === undefined) {
        keyframes.push({ t, pose, ease: 'linear' });
        hold.last = pose;
        return;
      }
      if (samePose(pose, hold.last)) {
        hold.pending = { t, pose, ease: 'linear' };
        return;
      }
      if (hold.pending !== undefined) {
        keyframes.push(hold.pending);
        hold.pending = undefined;
      }
      keyframes.push({ t, pose, ease: 'linear' });
      hold.last = pose;
    };

    const dt = STEP_MS / 1000;
    for (let step = 0; ; step += 1) {
      const t = from + step * STEP_MS;
      if (t > to) break;
      const moment = group.find((m) => t >= m.startMs && t < m.endMs);
      let targetScale = 1;
      if (moment === undefined) {
        activeMoment = undefined;
        target = { x: rest.cx, y: rest.cy };
      } else {
        targetScale = resolved.maxZoom;
        if (moment !== activeMoment) {
          activeMoment = moment;
          const aim = clampPose({ scale: targetScale, cx: moment.x, cy: moment.y }, frame);
          target = { x: aim.cx, y: aim.cy };
        } else if (events.length > 0 && t >= moment.startMs + resolved.leadInMs) {
          const cursor = cursorAt(events, t + resolved.lookAheadMs, frame);
          const moved = followCursor(target, cursor, frame, targetScale, resolved.deadZone);
          const clamped = clampPose({ scale: targetScale, cx: moved.x, cy: moved.y }, frame);
          target = { x: clamped.cx, y: clamped.cy };
        }
      }

      // Close to a resting value the spring only creeps. Snap there so rest and full zoom are exact.
      const goal = moment === undefined ? 1 : resolved.maxZoom;
      if (Math.abs(scale.out.x - goal) < SNAP_SCALE && Math.abs(scale.lead.x - goal) < SNAP_SCALE) {
        scale.out.x = goal;
        scale.lead.x = goal;
        scale.out.v = 0;
        scale.lead.v = 0;
        if (moment === undefined) {
          for (const axis of [px, py]) {
            axis.out.v = 0;
            axis.lead.v = 0;
          }
          px.out.x = rest.cx;
          px.lead.x = rest.cx;
          py.out.x = rest.cy;
          py.lead.x = rest.cy;
        }
      }

      // Write the state before stepping, so the first keyframe is exactly the whole frame.
      if (step % KEYFRAME_EVERY === 0) {
        emit(t, clampPose({ scale: scale.out.x, cx: px.out.x, cy: py.out.x }, frame));
      }
      stepChain(scale, targetScale, omega, dt);
      if (scale.out.x < 1 || scale.out.x > resolved.maxZoom) {
        scale.out.x = Math.min(resolved.maxZoom, Math.max(1, scale.out.x));
        scale.out.v = 0;
      }
      stepChain(px, target.x, omega, dt);
      stepChain(py, target.y, omega, dt);
    }
    // Snap to rest so the plan ends exactly on the whole frame, and flush a held pose first.
    if (hold.pending !== undefined) {
      keyframes.push(hold.pending);
    }
    const tail = keyframes[keyframes.length - 1];
    if (tail === undefined || tail.t < to || tail.pose.scale !== 1) {
      keyframes.push({ t: to, pose: rest, ease: 'linear' });
    }
  }
  return keyframes;
}

/**
 * Plans camera keyframes that zoom in around left clicks, follow the cursor while zoomed and ease
 * back out to the full frame. A log with no left clicks, or a `maxZoom` of 1, yields no
 * keyframes. The same input always yields the same plan.
 */
export function planZoom(log: InputLog, options: Partial<ZoomOptions> = {}): CameraKeyframe[] {
  return planCamera(planZoomMoments(log, options), log, options);
}
