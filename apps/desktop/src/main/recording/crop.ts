export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A region drawn in device independent pixels on the desktop, as the pixels of the recorded video.
 * The video covers one display, so the display's own position is taken off first: a box on a second
 * display that sits to the right of the first starts at the left of that display's video, not at
 * the left of the desktop. Each edge is rounded on its own, so neighbouring regions never leave a
 * gap or overlap by a pixel.
 */
export function cropInPixels(
  crop: Box,
  displayOrigin: { x: number; y: number },
  scale: number,
): Box {
  const left = Math.round((crop.x - displayOrigin.x) * scale);
  const top = Math.round((crop.y - displayOrigin.y) * scale);
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.round((crop.x - displayOrigin.x + crop.width) * scale) - left),
    height: Math.max(1, Math.round((crop.y - displayOrigin.y + crop.height) * scale) - top),
  };
}
