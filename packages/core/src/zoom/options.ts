export interface ZoomOptions {
  /** Zoom factor while zoomed in. The app offers 1.2 to 3. */
  maxZoom: number;
  /** How long before the first click of a moment the zoom starts, in milliseconds. */
  leadInMs: number;
  /**
   * How long the camera takes to travel, in and out, as the time it needs to cover 95 percent of
   * the way. Larger values feel smoother and slower.
   */
  easeMs: number;
  /** How long the camera stays zoomed after the last click of a moment. */
  holdMs: number;
  /** How far ahead of the clock the camera looks at the cursor while zoomed, in milliseconds. */
  lookAheadMs: number;
  /** Share of the zoomed half view in which the cursor can move without the camera following. */
  deadZone: number;
}

export const defaultZoomOptions: ZoomOptions = {
  maxZoom: 2,
  leadInMs: 250,
  easeMs: 480,
  holdMs: 1200,
  lookAheadMs: 120,
  deadZone: 0.5,
};

/** Fills in defaults and rejects values the planner cannot work with. */
export function resolveZoomOptions(options: Partial<ZoomOptions>): ZoomOptions {
  const resolved = { ...defaultZoomOptions, ...options };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Zoom option ${name} must be a finite number.`);
    }
  }
  if (resolved.maxZoom < 1) {
    throw new RangeError('Zoom option maxZoom must be at least 1.');
  }
  if (resolved.easeMs <= 0) {
    throw new RangeError('Zoom option easeMs must be greater than 0.');
  }
  if (resolved.deadZone < 0 || resolved.deadZone > 1) {
    throw new RangeError('Zoom option deadZone must be between 0 and 1.');
  }
  for (const name of ['leadInMs', 'holdMs', 'lookAheadMs'] as const) {
    if (resolved[name] < 0) {
      throw new RangeError(`Zoom option ${name} must not be negative.`);
    }
  }
  return resolved;
}
