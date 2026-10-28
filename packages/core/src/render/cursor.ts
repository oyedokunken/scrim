import { cursorAt } from '../zoom/cursor';
import type { ClickEvent, Frame, InputEvent } from '../input/types';
import { CURSOR_DEFAULTS, unit, type CursorStyle } from './constants';

export interface Halo {
  /** Center in frame pixels of the recorded area. */
  x: number;
  y: number;
  radius: number;
}

export interface Ripple {
  x: number;
  y: number;
  /** 0 when the click lands, 1 when the ripple has faded out. */
  progress: number;
  radius: number;
  /** 1 at the start, 0 at the end. */
  alpha: number;
}

export interface CursorState {
  halo: Halo | null;
  ripples: Ripple[];
}

export const NO_CURSOR: CursorState = { halo: null, ripples: [] };

export interface CursorTrack {
  /** Events sorted by time. The log times already include the display latency. */
  events: readonly InputEvent[];
  clicks: readonly ClickEvent[];
  frame: Frame;
}

export function prepareCursor(events: readonly InputEvent[], frame: Frame): CursorTrack {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const clicks = sorted.filter((event): event is ClickEvent => event.type === 'click');
  return { events: sorted, clicks, frame };
}

function easeOutCubic(p: number): number {
  return 1 - (1 - p) ** 3;
}

/**
 * Halo and ripples at recording time `t`. Log times were already shifted by the display latency
 * when the log was saved, so the halo lands on the cursor drawn into the video and nothing is
 * added here. The halo is hidden when the cursor is outside the recorded area, which happens for
 * a region recording.
 */
export function cursorStateAt(track: CursorTrack, t: number, style: CursorStyle): CursorState {
  if (style === 'off' || track.events.length === 0) return NO_CURSOR;
  const scale = unit(track.frame);
  const { frame } = track;

  let halo: Halo | null = null;
  if (style === 'halo' || style === 'halo-ripples') {
    const point = cursorAt(track.events, t, frame);
    const radius = CURSOR_DEFAULTS.haloRadius * scale;
    const inside =
      point.x >= -radius &&
      point.y >= -radius &&
      point.x <= frame.width + radius &&
      point.y <= frame.height + radius;
    if (inside) halo = { x: point.x, y: point.y, radius };
  }

  const ripples: Ripple[] = [];
  if (style === 'ripples' || style === 'halo-ripples') {
    const duration = CURSOR_DEFAULTS.rippleDurationMs;
    // First click that could still be visible: its time is at least t minus the duration.
    let low = 0;
    let high = track.clicks.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      const click = track.clicks[middle];
      if (click !== undefined && click.t < t - duration) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < track.clicks.length; i += 1) {
      const click = track.clicks[i];
      if (click === undefined || click.t > t) break;
      const progress = (t - click.t) / duration;
      if (progress >= 1) continue;
      const grow = easeOutCubic(progress);
      const from = CURSOR_DEFAULTS.rippleStartRadius;
      const to = CURSOR_DEFAULTS.rippleEndRadius;
      ripples.push({
        x: click.x,
        y: click.y,
        progress,
        radius: (from + (to - from) * grow) * scale,
        alpha: 1 - progress,
      });
    }
  }
  return { halo, ripples };
}
