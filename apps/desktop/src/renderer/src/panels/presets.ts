/** The choices on the Cursor and Zoom pages, and the numbers each one stands for. */

export const CURSOR_STYLE_OPTIONS = [
  { value: 'halo-ripples', label: 'Halo and ripples' },
  { value: 'halo', label: 'Halo only' },
  { value: 'ripples', label: 'Ripples only' },
  { value: 'off', label: 'Off' },
] as const;
export type CursorStyleId = (typeof CURSOR_STYLE_OPTIONS)[number]['value'];

export const HALO_COLOR_OPTIONS = [
  { value: 'brand', label: 'Brand', swatch: 'ui-swatch-brand' },
  { value: 'green', label: 'Green', swatch: 'ui-swatch-green' },
  { value: 'white', label: 'White', swatch: 'ui-swatch-white' },
  { value: 'black', label: 'Black', swatch: 'ui-swatch-black' },
] as const;
export type HaloColorId = (typeof HALO_COLOR_OPTIONS)[number]['value'];

export const ZOOM_STRENGTHS = [
  { id: 'subtle', label: 'Subtle', level: 1.4 },
  { id: 'medium', label: 'Medium', level: 1.8 },
  { id: 'strong', label: 'Strong', level: 2.4 },
] as const;
export type ZoomStrengthId = (typeof ZOOM_STRENGTHS)[number]['id'];

export const ZOOM_HOLDS = [
  { value: 'short', label: 'Short', ms: 800 },
  { value: 'medium', label: 'Medium', ms: 1200 },
  { value: 'long', label: 'Long', ms: 2000 },
] as const;
export type ZoomHoldId = (typeof ZOOM_HOLDS)[number]['value'];

/** Motion is stored as the smoothness number the planner takes: higher eases for longer. */
export const ZOOM_MOTIONS = [
  { value: 'snappy', label: 'Snappy', smoothness: 0.3 },
  { value: 'smooth', label: 'Smooth', smoothness: 0.6 },
  { value: 'gentle', label: 'Gentle', smoothness: 0.9 },
] as const;
export type ZoomMotionId = (typeof ZOOM_MOTIONS)[number]['value'];

/** The entry whose number is closest, so an older or edited value still selects something. */
function closest<T>(list: readonly T[], numberOf: (item: T) => number, value: number): T {
  let best = list[0] as T;
  for (const item of list) {
    if (Math.abs(numberOf(item) - value) < Math.abs(numberOf(best) - value)) {
      best = item;
    }
  }
  return best;
}

export function strengthOf(level: number): ZoomStrengthId {
  return closest(ZOOM_STRENGTHS, (item) => item.level, level).id;
}

export function holdOf(ms: number): ZoomHoldId {
  return closest(ZOOM_HOLDS, (item) => item.ms, ms).value;
}

export function motionOf(smoothness: number): ZoomMotionId {
  return closest(ZOOM_MOTIONS, (item) => item.smoothness, smoothness).value;
}
