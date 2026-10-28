import { screen } from 'electron';
import { createRegionSelector, type DisplayInfo, type RegionOutcome } from './region-selector';
import { createOverlayOpener } from './region-window';

export interface RegionPicker {
  /** Shows the overlays, and resolves when a box is confirmed or the selection is cancelled. */
  select(): Promise<RegionOutcome>;
  cancel(): void;
}

function currentDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
  }));
}

/**
 * The region selector for the home screen: one overlay per display, drag a box, Enter confirms,
 * Escape cancels. The result is in the same units the recording service stores a region in.
 */
export function createRegionPicker(options: { appOrigin: string }): RegionPicker {
  const log = (message: string): void => {
    console.error(message);
  };
  return createRegionSelector({
    displays: currentDisplays,
    openOverlay: createOverlayOpener({ appOrigin: options.appOrigin, log }),
    log,
  });
}
