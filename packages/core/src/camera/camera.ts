import type { Frame } from '../input/types';

/** Where the virtual camera looks: a zoom factor and the center of the view in frame pixels. */
export interface CameraPose {
  scale: number;
  cx: number;
  cy: number;
}

/** How the camera travels into a keyframe from the one before it. */
export type Ease = 'inOut' | 'linear';

export interface CameraKeyframe {
  /** Milliseconds on the recording clock. */
  t: number;
  pose: CameraPose;
  /** Easing of the segment that ends at this keyframe. */
  ease: Ease;
}

/** The part of the frame the camera shows, in frame pixels. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The camera looking at the whole frame. */
export function identityPose(frame: Frame): CameraPose {
  return { scale: 1, cx: frame.width / 2, cy: frame.height / 2 };
}

function clampTo(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Forces a pose to be valid: scale at least 1 and a center that keeps the whole view inside
 * the frame. Non finite values fall back to the identity pose.
 */
export function clampPose(pose: CameraPose, frame: Frame): CameraPose {
  const scale = Number.isFinite(pose.scale) ? Math.max(1, pose.scale) : 1;
  const halfWidth = frame.width / (2 * scale);
  const halfHeight = frame.height / (2 * scale);
  return {
    scale,
    cx: clampTo(pose.cx, halfWidth, frame.width - halfWidth, frame.width / 2),
    cy: clampTo(pose.cy, halfHeight, frame.height - halfHeight, frame.height / 2),
  };
}

/** The rectangle of the frame that a pose shows. */
export function viewRect(pose: CameraPose, frame: Frame): ViewRect {
  const width = frame.width / pose.scale;
  const height = frame.height / pose.scale;
  return { x: pose.cx - width / 2, y: pose.cy - height / 2, width, height };
}

/** Cubic ease in and out. Takes and returns a value from 0 to 1. */
export function easeInOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * The camera pose at time `t`. Keyframes must be in time order. Before the first keyframe the
 * camera holds the first pose, after the last it holds the last. The result is always clamped,
 * so the view never leaves the frame whatever the keyframes say.
 */
export function sampleCamera(
  keyframes: readonly CameraKeyframe[],
  t: number,
  frame: Frame,
): CameraPose {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first === undefined || last === undefined) {
    return identityPose(frame);
  }
  if (t <= first.t) {
    return clampPose(first.pose, frame);
  }
  if (t >= last.t) {
    return clampPose(last.pose, frame);
  }

  // Binary search for the last keyframe at or before t.
  let low = 0;
  let high = keyframes.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    const candidate = keyframes[middle];
    if (candidate !== undefined && candidate.t <= t) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const from = keyframes[low];
  const to = keyframes[high];
  if (from === undefined || to === undefined) {
    return clampPose(last.pose, frame);
  }
  const span = to.t - from.t;
  const linear = span > 0 ? (t - from.t) / span : 1;
  const amount = to.ease === 'linear' ? linear : easeInOutCubic(linear);
  return clampPose(
    {
      scale: mix(from.pose.scale, to.pose.scale, amount),
      cx: mix(from.pose.cx, to.pose.cx, amount),
      cy: mix(from.pose.cy, to.pose.cy, amount),
    },
    frame,
  );
}
