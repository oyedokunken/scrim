import { palette } from '@scrim/tokens';
import {
  clampRectTo,
  distanceToSegment,
  rectContains,
  type Point,
  type Rect,
  type Size,
} from './geometry';

export type Tool = 'select' | 'crop' | 'arrow' | 'box' | 'highlight' | 'text' | 'blur';

/** Annotation colors: the palette, and the record red for marking things only. */
export const COLORS = {
  green: palette.green,
  black: palette.black,
  white: palette.white,
  red: palette.record,
} as const;
export type ColorName = keyof typeof COLORS;

export const THICKNESSES = { thin: 3, medium: 6, thick: 10 } as const;
export type ThicknessName = keyof typeof THICKNESSES;

interface Base {
  id: number;
  color: ColorName;
  thickness: ThicknessName;
}

export interface ArrowItem extends Base {
  kind: 'arrow';
  from: Point;
  to: Point;
}

export interface BoxItem extends Base {
  kind: 'box' | 'highlight' | 'blur';
  rect: Rect;
}

export interface TextItem extends Base {
  kind: 'text';
  at: Point;
  text: string;
}

export type Item = ArrowItem | BoxItem | TextItem;

/** Everything an edit changes. The image itself never does. Crop is in image pixels, null means all. */
export interface Doc {
  crop: Rect | null;
  items: readonly Item[];
}

export const EMPTY_DOC: Doc = { crop: null, items: [] };

/** The part of the image the person sees and saves. */
export function visibleRect(doc: Doc, image: Size): Rect {
  return doc.crop ?? { x: 0, y: 0, width: image.width, height: image.height };
}

/** The size of the saved picture. */
export function outputSize(doc: Doc, image: Size): Size {
  const view = visibleRect(doc, image);
  return { width: view.width, height: view.height };
}

export function nextId(doc: Doc): number {
  return doc.items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

export function addItem(doc: Doc, item: Item): Doc {
  return { ...doc, items: [...doc.items, item] };
}

export function removeItem(doc: Doc, id: number): Doc {
  return { ...doc, items: doc.items.filter((item) => item.id !== id) };
}

export function replaceItem(doc: Doc, item: Item): Doc {
  return {
    ...doc,
    items: doc.items.map((existing) => (existing.id === item.id ? item : existing)),
  };
}

export function setCrop(doc: Doc, crop: Rect | null): Doc {
  return { ...doc, crop };
}

/** The box that holds an item, for handles and for keeping it inside the picture. */
export function boundsOf(item: Item, fontSize: number): Rect {
  switch (item.kind) {
    case 'arrow': {
      const x = Math.min(item.from.x, item.to.x);
      const y = Math.min(item.from.y, item.to.y);
      return {
        x,
        y,
        width: Math.abs(item.from.x - item.to.x),
        height: Math.abs(item.from.y - item.to.y),
      };
    }
    case 'text':
      return {
        x: item.at.x,
        y: item.at.y,
        width: textWidth(item.text, fontSize),
        height: fontSize * 1.3,
      };
    default:
      return item.rect;
  }
}

/** The text size for a thickness: thin, medium and thick read as small, medium and large. */
export function fontSizeFor(thickness: ThicknessName): number {
  return { thin: 22, medium: 32, thick: 48 }[thickness];
}

/** An estimate good enough for hit testing and handles. Drawing measures the real text. */
export function textWidth(text: string, fontSize: number): number {
  return Math.max(fontSize, text.length * fontSize * 0.55);
}

/** The top most item under a point, or null. `reach` is the slack in image pixels. */
export function hitTest(doc: Doc, point: Point, reach: number): Item | null {
  for (let index = doc.items.length - 1; index >= 0; index -= 1) {
    const item = doc.items[index];
    if (item === undefined) continue;
    if (item.kind === 'arrow') {
      const slack = reach + THICKNESSES[item.thickness] / 2;
      if (distanceToSegment(point, item.from, item.to) <= slack) return item;
    } else if (item.kind === 'text') {
      if (rectContains(boundsOf(item, fontSizeFor(item.thickness)), point, reach)) return item;
    } else if (item.kind === 'box') {
      // An outline is picked on its edge, so a box around something does not hide what is inside it.
      const slack = reach + THICKNESSES[item.thickness] / 2;
      const outer = rectContains(item.rect, point, slack);
      const inner = rectContains(
        {
          x: item.rect.x + slack,
          y: item.rect.y + slack,
          width: Math.max(0, item.rect.width - 2 * slack),
          height: Math.max(0, item.rect.height - 2 * slack),
        },
        point,
      );
      if (outer && !inner) return item;
    } else if (rectContains(item.rect, point, reach)) {
      return item;
    }
  }
  return null;
}

/** An item moved by an offset and held inside the visible picture, keeping its size. */
export function moveItem(item: Item, dx: number, dy: number, bounds: Rect): Item {
  const box = boundsOf(item, fontSizeFor(item.thickness));
  const moved = clampRectTo({ ...box, x: box.x + dx, y: box.y + dy }, bounds);
  const shiftX = moved.x - box.x;
  const shiftY = moved.y - box.y;
  switch (item.kind) {
    case 'arrow':
      return {
        ...item,
        from: { x: item.from.x + shiftX, y: item.from.y + shiftY },
        to: { x: item.to.x + shiftX, y: item.to.y + shiftY },
      };
    case 'text':
      return { ...item, at: { x: item.at.x + shiftX, y: item.at.y + shiftY } };
    default:
      return { ...item, rect: { ...item.rect, x: item.rect.x + shiftX, y: item.rect.y + shiftY } };
  }
}
