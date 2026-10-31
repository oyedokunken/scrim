import type { ZoomMoment } from '@scrim/core/zoom';
import type { CompareMode } from './draw-frame';

/** What the timeline gets for a view mode: effects only appear where the picture shows them. */
export interface ModeTimeline<T> {
  moments: readonly ZoomMoment[];
  texts: readonly T[];
  /** True when the effect markers are left out, so the strip can say why. */
  effectsHidden: boolean;
}

/**
 * Before is the plain picture, so it has no zoom moments and no text markers on the timeline.
 * After and Compare (whose right side is After) show them all.
 */
export function timelineForMode<T>(
  mode: CompareMode,
  moments: readonly ZoomMoment[],
  texts: readonly T[],
): ModeTimeline<T> {
  if (mode === 'before') return { moments: [], texts: [], effectsHidden: true };
  return { moments, texts, effectsHidden: false };
}
