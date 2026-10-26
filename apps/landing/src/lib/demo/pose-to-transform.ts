import type { CameraPose, Frame } from '@scrim/core/zoom';

function format(value: number): string {
  // Four decimals is far below a pixel, and `+ 0` turns a negative zero into zero.
  return String(Number(value.toFixed(4)) + 0);
}

/**
 * The CSS transform that makes a pose visible. Apply it to an element that holds the whole frame,
 * with `transform-origin: 0 0`. The translate is a percentage of the element, so it holds at any
 * rendered size. The view of a pose is the part of the frame it looks at, scaled up to fill.
 */
export function poseToTransform(pose: CameraPose, frame: Frame): string {
  const left = pose.cx - frame.width / (2 * pose.scale);
  const top = pose.cy - frame.height / (2 * pose.scale);
  const x = -((left * pose.scale) / frame.width) * 100;
  const y = -((top * pose.scale) / frame.height) * 100;
  return `translate(${format(x)}%, ${format(y)}%) scale(${format(pose.scale)})`;
}
