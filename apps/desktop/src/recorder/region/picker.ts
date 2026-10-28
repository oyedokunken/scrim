import {
  contains,
  dragRect,
  moveRect,
  toEvenPixels,
  type PixelRegion,
  type Point,
  type Rect,
  type Size,
} from './geometry';

export type PickerAction =
  { type: 'begin' } | { type: 'confirm'; rect: Rect } | { type: 'cancel' } | undefined;

export type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** A drag shorter than this, in device independent pixels, is a click, not a box. */
const MIN_DRAG = 4;
/** How close to an edge or corner counts as being on its handle. */
const HANDLE_REACH = 8;
/** The smallest a box can be resized to, so a handle can never fold it flat. */
const MIN_SIDE = 16;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * What the area overlay does with the pointer and the keyboard, with no page in it. Drag on an
 * empty part of the display to draw a box. Drag a handle to resize it, or drag inside it to move
 * it. Enter confirms a box that is big enough, and Escape cancels. The answers are plain values,
 * so the page only has to draw `box` and report the actions.
 */
export class RegionPicker {
  private readonly display: Size;
  private readonly scale: number;
  private start: Point | undefined;
  private grab: Point | undefined;
  private original: Rect | undefined;
  private handle: Handle | undefined;
  private current: Rect | undefined;
  private dragging: 'draw' | 'move' | 'resize' | undefined;

  constructor(display: Size, scale: number) {
    this.display = display;
    this.scale = scale;
  }

  /** The box to draw, in device independent pixels on this display. */
  get box(): Rect | undefined {
    return this.current;
  }

  /** The box as the whole even pixels it will record, or undefined while it is too small. */
  get pixels(): PixelRegion | undefined {
    return this.current === undefined
      ? undefined
      : toEvenPixels(this.current, this.scale, this.display);
  }

  get isDragging(): boolean {
    return this.dragging !== undefined;
  }

  /** The handle under a point, for the right cursor and for starting a resize. */
  handleAt(point: Point): Handle | undefined {
    const box = this.current;
    if (box === undefined) return undefined;
    const near = (value: number, edge: number): boolean => Math.abs(value - edge) <= HANDLE_REACH;
    const left = near(point.x, box.x);
    const right = near(point.x, box.x + box.width);
    const top = near(point.y, box.y);
    const bottom = near(point.y, box.y + box.height);
    const withinX = point.x >= box.x - HANDLE_REACH && point.x <= box.x + box.width + HANDLE_REACH;
    const withinY = point.y >= box.y - HANDLE_REACH && point.y <= box.y + box.height + HANDLE_REACH;
    if (top && left) return 'nw';
    if (top && right) return 'ne';
    if (bottom && left) return 'sw';
    if (bottom && right) return 'se';
    if (top && withinX) return 'n';
    if (bottom && withinX) return 's';
    if (left && withinY) return 'w';
    if (right && withinY) return 'e';
    return undefined;
  }

  pointerDown(point: Point): PickerAction {
    const handle = this.handleAt(point);
    if (handle !== undefined && this.current !== undefined) {
      this.dragging = 'resize';
      this.handle = handle;
      this.original = this.current;
      return undefined;
    }
    if (this.current !== undefined && contains(this.current, point)) {
      this.dragging = 'move';
      this.grab = point;
      return undefined;
    }
    this.dragging = 'draw';
    this.start = point;
    this.current = undefined;
    return { type: 'begin' };
  }

  pointerMove(point: Point): void {
    if (this.dragging === 'draw' && this.start !== undefined) {
      this.current = dragRect(this.start, point, this.display);
    } else if (this.dragging === 'move' && this.grab !== undefined && this.current !== undefined) {
      this.current = moveRect(
        this.current,
        point.x - this.grab.x,
        point.y - this.grab.y,
        this.display,
      );
      this.grab = point;
    } else if (
      this.dragging === 'resize' &&
      this.handle !== undefined &&
      this.original !== undefined
    ) {
      this.current = this.resized(this.original, this.handle, point);
    }
  }

  /** The original box with the edges a handle controls moved to the pointer, never folded flat. */
  private resized(box: Rect, handle: Handle, point: Point): Rect {
    let left = box.x;
    let right = box.x + box.width;
    let top = box.y;
    let bottom = box.y + box.height;
    if (handle.includes('w')) left = clamp(point.x, 0, right - MIN_SIDE);
    if (handle.includes('e')) right = clamp(point.x, left + MIN_SIDE, this.display.width);
    if (handle.includes('n')) top = clamp(point.y, 0, bottom - MIN_SIDE);
    if (handle.includes('s')) bottom = clamp(point.y, top + MIN_SIDE, this.display.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  pointerUp(point: Point): void {
    this.pointerMove(point);
    if (
      this.dragging === 'draw' &&
      this.current !== undefined &&
      (this.current.width < MIN_DRAG || this.current.height < MIN_DRAG)
    ) {
      this.current = undefined;
    }
    this.dragging = undefined;
    this.start = undefined;
    this.grab = undefined;
    this.original = undefined;
    this.handle = undefined;
  }

  /** Drops the box, as when another display's overlay started one. */
  clear(): void {
    this.current = undefined;
    this.dragging = undefined;
    this.start = undefined;
    this.grab = undefined;
    this.original = undefined;
    this.handle = undefined;
  }

  key(name: string): PickerAction {
    if (name === 'Escape') return { type: 'cancel' };
    if (name === 'Enter') {
      const region = this.pixels;
      return region === undefined ? undefined : { type: 'confirm', rect: region.dip };
    }
    return undefined;
  }
}
