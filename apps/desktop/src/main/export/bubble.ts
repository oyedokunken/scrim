import { BUBBLE_DEFAULTS, easeInOutCubic } from '@scrim/core';
import type {
  BubbleKeyframe,
  BubbleLayout,
  BubbleShape,
  Frame,
  Layout,
  SessionFile,
} from '@scrim/core';
import type { BubblePlacement } from './compositor';

/** How long the bubble takes to glide to a new corner, matching the live bubble. */
const GLIDE_MS = 220;

export interface BubbleTrack {
  /** The placement for a time on the recording clock, or null when no camera picture is wanted. */
  at(timeMs: number): BubblePlacement | null;
  /** The biggest side the bubble ever has, in output pixels, to size the camera decode. */
  maxSide: number;
}

interface Pose {
  x: number;
  y: number;
  side: number;
}

/**
 * Turns the bubble positions saved while recording (device independent pixels on the desktop)
 * into positions on the finished picture, and replays them over time. A recording without saved
 * positions uses the corner chosen in the style.
 */
export function createBubbleTrack(input: {
  session: Pick<SessionFile, 'bubble' | 'source'>;
  source: Frame;
  layout: Layout;
  staticBubble: BubbleLayout | null;
  shape: BubbleShape;
}): BubbleTrack | null {
  const { session, source, layout, staticBubble, shape } = input;
  const radiusFor = (side: number): number =>
    shape === 'circle' ? side / 2 : side * BUBBLE_DEFAULTS.roundedShare;
  const keyframes: BubbleKeyframe[] = session.bubble ?? [];

  if (staticBubble === null && keyframes.length === 0) return null;
  if (keyframes.length === 0 || staticBubble === null) {
    if (staticBubble === null) return null;
    const placement: BubblePlacement = {
      x: staticBubble.rect.x,
      y: staticBubble.rect.y,
      side: staticBubble.rect.width,
      radius: staticBubble.radius,
    };
    return { at: () => placement, maxSide: placement.side };
  }

  const { content } = layout;
  const k = content.width / source.width;
  const scale = session.source.scaleFactor;
  const cropX = session.source.cropPx?.x ?? 0;
  const cropY = session.source.cropPx?.y ?? 0;
  const poses: Pose[] = keyframes.map((frame) => {
    const side = frame.size * scale * k;
    const x = content.x + ((frame.x - session.source.origin.x) * scale - cropX) * k;
    const y = content.y + ((frame.y - session.source.origin.y) * scale - cropY) * k;
    // Stays inside the recording even when the bubble sat outside a recorded region.
    return {
      side,
      x: Math.min(Math.max(x, content.x), Math.max(content.x, content.x + content.width - side)),
      y: Math.min(Math.max(y, content.y), Math.max(content.y, content.y + content.height - side)),
    };
  });
  const maxSide = Math.max(...poses.map((pose) => pose.side));

  return {
    maxSide,
    at(timeMs) {
      let index = 0;
      for (let i = 0; i < keyframes.length; i += 1) {
        if ((keyframes[i]?.t ?? 0) <= timeMs) index = i;
        else break;
      }
      const current = poses[index];
      if (current === undefined) return null;
      let pose = current;
      const previous = poses[index - 1];
      const since = timeMs - (keyframes[index]?.t ?? 0);
      if (previous !== undefined && since < GLIDE_MS) {
        const amount = easeInOutCubic(since / GLIDE_MS);
        pose = {
          x: previous.x + (current.x - previous.x) * amount,
          y: previous.y + (current.y - previous.y) * amount,
          side: previous.side + (current.side - previous.side) * amount,
        };
      }
      return { x: pose.x, y: pose.y, side: pose.side, radius: radiusFor(pose.side) };
    },
  };
}
