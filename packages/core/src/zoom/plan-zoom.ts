import { clampPose, identityPose } from '../camera/camera';
import type { CameraKeyframe, CameraPose } from '../camera/camera';
import type { ClickEvent, Frame, InputEvent, InputLog } from '../input/types';
import { cursorAt } from './cursor';
import type { Point } from './cursor';
import { resolveZoomOptions } from './options';
import type { ZoomOptions } from './options';

/** While zoomed, the camera pans only when the cursor leaves this share of the half view. */
const FOLLOW_DEAD_ZONE = 0.5;

interface Interval {
  /** Where the zoom in starts. */
  start: number;
  /** Where the zoom out starts. */
  end: number;
  /** The first click, which the camera aims at when the zoom in lands. */
  focus: Point;
}

function isLeftClick(event: InputEvent): event is ClickEvent {
  return event.type === 'click' && event.button === 'left';
}

/** Groups left clicks into bursts, where each click is within `windowMs` of the one before. */
function groupBursts(clicks: readonly ClickEvent[], windowMs: number): ClickEvent[][] {
  const bursts: ClickEvent[][] = [];
  for (const click of clicks) {
    const burst = bursts[bursts.length - 1];
    const previous = burst?.[burst.length - 1];
    if (burst !== undefined && previous !== undefined && click.t - previous.t <= windowMs) {
      burst.push(click);
    } else {
      bursts.push([click]);
    }
  }
  return bursts;
}

/**
 * Turns bursts into zoom intervals. Two intervals merge when the gap between them is too short
 * for a full zoom out, so the camera pans across instead of bouncing out and back in.
 */
function toIntervals(bursts: readonly ClickEvent[][], options: ZoomOptions): Interval[] {
  const intervals: Interval[] = [];
  for (const burst of bursts) {
    const first = burst[0];
    const last = burst[burst.length - 1];
    if (first === undefined || last === undefined) {
      continue;
    }
    const next: Interval = {
      start: Math.max(0, first.t - options.leadInMs),
      end: last.t + options.holdMs,
      focus: { x: first.x, y: first.y },
    };
    const previous = intervals[intervals.length - 1];
    // The zoom out cannot begin before the zoom in has landed, so a hold shorter than the ease
    // still ends at start plus ease. Judging by `end` alone let the next zoom start too early.
    const previousOut =
      previous === undefined ? 0 : Math.max(previous.end, previous.start + options.easeMs);
    if (previous !== undefined && next.start < previousOut + options.easeMs) {
      previous.end = Math.max(previous.end, next.end);
    } else {
      intervals.push(next);
    }
  }
  return intervals;
}

/**
 * Moves the camera center as little as possible so the cursor stays inside the inner part of
 * the view. A cursor that wanders near the middle does not move the camera at all.
 */
function followCursor(current: CameraPose, cursor: Point, frame: Frame): CameraPose {
  const reachX = (frame.width / (2 * current.scale)) * FOLLOW_DEAD_ZONE;
  const reachY = (frame.height / (2 * current.scale)) * FOLLOW_DEAD_ZONE;
  return clampPose(
    {
      scale: current.scale,
      cx: Math.min(cursor.x + reachX, Math.max(cursor.x - reachX, current.cx)),
      cy: Math.min(cursor.y + reachY, Math.max(cursor.y - reachY, current.cy)),
    },
    frame,
  );
}

/**
 * Plans camera keyframes that zoom in around bursts of left clicks: a short lead in, an ease in,
 * a hold that pans with the cursor, and an ease back out to the full frame. A log with no left
 * clicks, or a `maxZoom` of 1, yields no keyframes. The same input always yields the same plan.
 */
export function planZoom(log: InputLog, options: Partial<ZoomOptions> = {}): CameraKeyframe[] {
  const resolved = resolveZoomOptions(options);
  const { frame } = log;
  const events = [...log.events].sort((a, b) => a.t - b.t);
  const clicks = events.filter(isLeftClick);
  if (clicks.length === 0 || resolved.maxZoom === 1) {
    return [];
  }

  const keyframes: CameraKeyframe[] = [];
  const rest = identityPose(frame);

  for (const interval of toIntervals(groupBursts(clicks, resolved.mergeWindowMs), resolved)) {
    const zoomedAt = interval.start + resolved.easeMs;
    const end = Math.max(interval.end, zoomedAt);

    let pose = clampPose(
      { scale: resolved.maxZoom, cx: interval.focus.x, cy: interval.focus.y },
      frame,
    );
    keyframes.push({ t: interval.start, pose: rest, ease: 'inOut' });
    keyframes.push({ t: zoomedAt, pose, ease: 'inOut' });

    // Pan segments are linear so a steady drift of the cursor does not pulse the camera.
    for (let t = zoomedAt + resolved.followIntervalMs; t < end; t += resolved.followIntervalMs) {
      pose = followCursor(pose, cursorAt(events, t, frame), frame);
      keyframes.push({ t, pose, ease: 'linear' });
    }
    pose = followCursor(pose, cursorAt(events, end, frame), frame);
    keyframes.push({ t: end, pose, ease: 'linear' });
    keyframes.push({ t: end + resolved.easeMs, pose: rest, ease: 'inOut' });
  }
  return keyframes;
}
