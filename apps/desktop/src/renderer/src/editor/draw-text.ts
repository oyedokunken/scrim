import { layoutText, TEXT_CHIP_ALPHA, TEXT_PAINT } from '@scrim/core/render';
import type { TextItem, TextLayout } from '@scrim/core/render';

const FAMILY = '"Urbanist Variable", system-ui, sans-serif';

type TextContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText' | 'fontKerning'>;

function setFont(ctx: TextContext, px: number): void {
  ctx.font = `700 ${String(px)}px ${FAMILY}`;
  // The export draws without kerning, so the preview does too and the lines end in the same place.
  ctx.fontKerning = 'none';
}

/** Where an item sits in the output frame, measured with the canvas font. */
export function layoutOn(
  ctx: TextContext,
  item: TextItem,
  output: { width: number; height: number },
): TextLayout {
  return layoutText(
    item,
    (px) => {
      setFont(ctx, px);
      return ctx.measureText(item.text).width;
    },
    output,
  );
}

/** Draws the texts on a context scaled so one unit is one output pixel. Same layout as the export. */
export function drawTexts(
  ctx: CanvasRenderingContext2D,
  texts: readonly TextItem[],
  output: { width: number; height: number },
): void {
  if (texts.length === 0) return;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const item of texts) {
    const layout = layoutOn(ctx, item, output);
    const paint = TEXT_PAINT[item.color];
    if (item.chip) {
      const { box } = layout;
      ctx.globalAlpha = TEXT_CHIP_ALPHA;
      ctx.fillStyle = paint.chip;
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.width, box.height, layout.chipRadius);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    setFont(ctx, layout.fontPx);
    ctx.fillStyle = paint.text;
    ctx.fillText(item.text, layout.textX, layout.baselineY);
  }
  ctx.restore();
}

let measuring: CanvasRenderingContext2D | null | undefined;

/** A context that is only used to measure, so a handle can be sized without a visible canvas. */
export function measuringContext(): TextContext | null {
  if (measuring === undefined) {
    measuring = document.createElement('canvas').getContext('2d');
  }
  return measuring;
}

/** Loads the text font so the first canvas draw already uses it. Never rejects. */
export async function ensureTextFont(): Promise<void> {
  try {
    await document.fonts.load(`700 24px ${FAMILY}`);
  } catch {
    // The preview falls back to the system font and the export still uses Urbanist.
  }
}
