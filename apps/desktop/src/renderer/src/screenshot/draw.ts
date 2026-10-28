import { palette } from '@scrim/tokens';
import {
  COLORS,
  THICKNESSES,
  boundsOf,
  fontSizeFor,
  visibleRect,
  type ArrowItem,
  type BoxItem,
  type Doc,
  type Item,
  type TextItem,
} from './document';
import { handlePoints, type Rect, type Size } from './geometry';

type Source = CanvasImageSource;

const FONT = '"Urbanist Variable", system-ui, sans-serif';

function drawArrow(ctx: CanvasRenderingContext2D, item: ArrowItem): void {
  const width = THICKNESSES[item.thickness];
  const color = COLORS[item.color];
  const angle = Math.atan2(item.to.y - item.from.y, item.to.x - item.from.x);
  const head = width * 3 + 8;
  // The shaft stops inside the head, so the tip is a point and not a rounded stub.
  const baseX = item.to.x - Math.cos(angle) * head * 0.7;
  const baseY = item.to.y - Math.sin(angle) * head * 0.7;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(item.from.x, item.from.y);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(item.to.x, item.to.y);
  ctx.lineTo(
    item.to.x - head * Math.cos(angle - Math.PI / 7),
    item.to.y - head * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    item.to.x - head * Math.cos(angle + Math.PI / 7),
    item.to.y - head * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();
}

/** Hides a region by drawing it as large blocks, so what was written there cannot be read back. */
function drawPixelate(ctx: CanvasRenderingContext2D, image: Source, rect: Rect): void {
  const block = Math.max(10, Math.round(Math.min(rect.width, rect.height) / 8));
  const smallW = Math.max(1, Math.ceil(rect.width / block));
  const smallH = Math.max(1, Math.ceil(rect.height / block));
  const small = document.createElement('canvas');
  small.width = smallW;
  small.height = smallH;
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return;
  smallCtx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, smallW, smallH);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, smallW, smallH, rect.x, rect.y, smallW * block, smallH * block);
  ctx.restore();
}

function drawBox(ctx: CanvasRenderingContext2D, image: Source, item: BoxItem): void {
  const { rect } = item;
  if (item.kind === 'blur') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    drawPixelate(ctx, image, rect);
    ctx.restore();
    return;
  }
  if (item.kind === 'highlight') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS[item.color];
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = COLORS[item.color];
  ctx.lineWidth = THICKNESSES[item.thickness];
  ctx.lineJoin = 'round';
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem): void {
  const size = fontSizeFor(item.thickness);
  ctx.font = `700 ${String(size)}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS[item.color];
  ctx.fillText(item.text, item.at.x, item.at.y);
}

function drawItem(ctx: CanvasRenderingContext2D, image: Source, item: Item): void {
  switch (item.kind) {
    case 'arrow':
      drawArrow(ctx, item);
      break;
    case 'text':
      drawText(ctx, item);
      break;
    default:
      drawBox(ctx, image, item);
  }
}

export interface DrawOptions {
  /** Screen pixels per image pixel. 1 for the saved picture. */
  scale: number;
  /** An item being drawn right now, not yet part of the document. */
  draft?: Item | null;
}

/**
 * Paints the picture as it will be saved: the visible part of the image, then every item in order.
 * The same function draws the screen and the saved file, so what you see is what you get.
 */
export function drawDoc(
  ctx: CanvasRenderingContext2D,
  image: Source,
  imageSize: Size,
  doc: Doc,
  options: DrawOptions,
): void {
  const view = visibleRect(doc, imageSize);
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(options.scale, options.scale);
  ctx.translate(-view.x, -view.y);
  ctx.drawImage(image, 0, 0);
  for (const item of doc.items) drawItem(ctx, image, item);
  if (options.draft) drawItem(ctx, image, options.draft);
  ctx.restore();
}

/** The marks that help editing and are never saved: the selection and its handles, and the crop box. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  imageSize: Size,
  options: { scale: number; selected: Item | null; cropDraft: Rect | null },
): void {
  const view = visibleRect(doc, imageSize);
  const { scale } = options;
  const toScreen = (rect: Rect): Rect => ({
    x: (rect.x - view.x) * scale,
    y: (rect.y - view.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });

  if (options.cropDraft) {
    const box = toScreen(options.cropDraft);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.fill('evenodd');
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }

  const { selected } = options;
  if (selected) {
    const area = toScreen(boundsOf(selected, fontSizeFor(selected.thickness)));
    ctx.save();
    ctx.strokeStyle = palette.green;
    ctx.fillStyle = palette.white;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(area.x - 4, area.y - 4, area.width + 8, area.height + 8);
    ctx.setLineDash([]);
    const grips =
      selected.kind === 'arrow'
        ? [selected.from, selected.to].map((point) => ({
            x: (point.x - view.x) * scale,
            y: (point.y - view.y) * scale,
          }))
        : selected.kind === 'text'
          ? []
          : Object.values(handlePoints(selected.rect)).map((point) => ({
              x: (point.x - view.x) * scale,
              y: (point.y - view.y) * scale,
            }));
    for (const grip of grips) {
      ctx.beginPath();
      ctx.rect(grip.x - 5, grip.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
