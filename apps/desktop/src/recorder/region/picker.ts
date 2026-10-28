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

/** A drag shorter than this, in device independent pixels, is a click, not a box. */
const MIN_DRAG = 4;

/**
 * What the region overlay does with the pointer and the keyboard, with no page in it. Drag on an
 * empty part of the display to draw a box. Drag inside the box to move it. Enter confirms a box
 * that is big enough, and Escape cancels. The answers are plain values, so the page only has to
 * draw `box` and report the actions.
 */
export class RegionPicker {
  private readonly display: Size;
  private readonly scale: number;
  private start: Point | undefined;
  private grab: Point | undefined;
  private current: Rect | undefined;
  private dragging: 'draw' | 'move' | undefined;

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

  pointerDown(point: Point): PickerAction {
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
    }
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
  }

  /** Drops the box, as when another display's overlay started one. */
  clear(): void {
    this.current = undefined;
    this.dragging = undefined;
    this.start = undefined;
    this.grab = undefined;
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
