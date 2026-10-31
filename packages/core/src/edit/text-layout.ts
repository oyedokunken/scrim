import { TEXT_LIMITS, type TextItem } from './text';

/** Where one text item sits in the output frame, in output pixels. Shared by preview and export. */
export interface TextLayout {
  /** Font size in pixels (the em). */
  fontPx: number;
  /** The box behind the text, which is also the chip when there is one. Always inside the frame. */
  box: { x: number; y: number; width: number; height: number };
  chipRadius: number;
  /** Left end of the text and its baseline. */
  textX: number;
  baselineY: number;
}

/** Share of the frame width the box may fill. */
const MAX_WIDTH_SHARE = 0.96;

/**
 * Lays out one item. `measure(px)` is the width of the text drawn at `px` pixels, which the
 * caller knows from its own font. The box is centered on the item's position, then shifted so it
 * stays inside the frame, and the text shrinks when it would be wider than the frame. The letters'
 * capital height is centered on the item's position.
 */
export function layoutText(
  item: TextItem,
  measure: (fontPx: number) => number,
  output: { width: number; height: number },
): TextLayout {
  let fontPx = Math.max(1, TEXT_LIMITS.sizeFraction[item.size] * output.height);
  const padX = 0.5;
  const wanted = measure(fontPx) + padX * 2 * fontPx;
  const room = output.width * MAX_WIDTH_SHARE;
  if (wanted > room) fontPx = Math.max(1, (fontPx * room) / wanted);

  const width = measure(fontPx) + padX * 2 * fontPx;
  const height = fontPx * 1.3;
  const cx = item.x * output.width;
  const cy = item.y * output.height;
  const x = Math.min(Math.max(0, cx - width / 2), Math.max(0, output.width - width));
  const y = Math.min(Math.max(0, cy - height / 2), Math.max(0, output.height - height));
  return {
    fontPx,
    box: { x, y, width, height },
    chipRadius: fontPx * 0.3,
    textX: x + padX * fontPx,
    baselineY: y + height / 2 + fontPx * 0.35,
  };
}
