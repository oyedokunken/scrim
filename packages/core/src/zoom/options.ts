export interface ZoomOptions {
  /** Zoom factor while zoomed in. The app offers 1.2 to 3. */
  maxZoom: number;
  /** How long before the first click of a burst the zoom starts, in milliseconds. */
  leadInMs: number;
  /** Duration of the zoom in and of the zoom out. Larger values feel smoother. */
  easeMs: number;
  /** How long the camera stays zoomed after the last click of a burst. */
  holdMs: number;
  /** Clicks closer together than this belong to one burst. */
  mergeWindowMs: number;
  /** How often the camera re-aims at the cursor while zoomed. */
  followIntervalMs: number;
}

export const defaultZoomOptions: ZoomOptions = {
  maxZoom: 2,
  leadInMs: 250,
  easeMs: 450,
  holdMs: 1200,
  mergeWindowMs: 1500,
  followIntervalMs: 300,
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
  if (resolved.followIntervalMs <= 0) {
    throw new RangeError('Zoom option followIntervalMs must be greater than 0.');
  }
  for (const name of ['leadInMs', 'easeMs', 'holdMs', 'mergeWindowMs'] as const) {
    if (resolved[name] < 0) {
      throw new RangeError(`Zoom option ${name} must not be negative.`);
    }
  }
  return resolved;
}
