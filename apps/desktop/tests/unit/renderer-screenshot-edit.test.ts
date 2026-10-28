import { describe, expect, it } from 'vitest';
import {
  EMPTY_DOC,
  addItem,
  boundsOf,
  fontSizeFor,
  hitTest,
  moveItem,
  nextId,
  outputSize,
  removeItem,
  replaceItem,
  setCrop,
  visibleRect,
  type Doc,
  type Item,
} from '../../src/renderer/src/screenshot/document';
import {
  MIN_BOX,
  clampPoint,
  clampRectTo,
  cropFromDrag,
  distanceToSegment,
  fitScale,
  handleAt,
  imageToView,
  rectFromPoints,
  resizeRect,
  viewToImage,
} from '../../src/renderer/src/screenshot/geometry';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  isDirty,
  push,
  redo,
  undo,
} from '../../src/renderer/src/screenshot/history';

const IMAGE = { width: 1000, height: 600 };
const FULL = { x: 0, y: 0, width: 1000, height: 600 };

const box = (id: number, x: number, y: number, width: number, height: number): Item => ({
  id,
  kind: 'box',
  color: 'red',
  thickness: 'medium',
  rect: { x, y, width, height },
});

describe('history', () => {
  it('starts clean and cannot step anywhere', () => {
    const history = createHistory(1);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(isDirty(history)).toBe(false);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('undoes and redoes every step in order', () => {
    let history = createHistory('a');
    history = push(history, 'b');
    history = push(history, 'c');
    expect(history.present).toBe('c');
    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);
    history = redo(history);
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('drops the redo steps when something new is done after an undo', () => {
    let history = push(push(createHistory('a'), 'b'), 'c');
    history = undo(history);
    history = push(history, 'x');
    expect(history.future).toEqual([]);
    expect(history.present).toBe('x');
    expect(undo(history).present).toBe('b');
  });

  it('does not count the same value as a step, and is dirty after a change and clean after undoing it', () => {
    const start = createHistory(EMPTY_DOC);
    expect(push(start, EMPTY_DOC)).toBe(start);
    const changed = push(start, setCrop(EMPTY_DOC, { x: 1, y: 1, width: 10, height: 10 }));
    expect(isDirty(changed)).toBe(true);
    expect(isDirty(undo(changed))).toBe(false);
  });

  it('keeps a bounded number of steps', () => {
    let history = createHistory(0);
    for (let step = 1; step <= HISTORY_LIMIT + 50; step += 1) history = push(history, step);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.present).toBe(HISTORY_LIMIT + 50);
  });
});

describe('geometry', () => {
  it('makes a box from two corners in any direction', () => {
    expect(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 20,
    });
  });

  it('keeps a box inside the image and shrinks one that is too big', () => {
    expect(clampRectTo({ x: -20, y: 590, width: 100, height: 50 }, FULL)).toEqual({
      x: 0,
      y: 550,
      width: 100,
      height: 50,
    });
    expect(clampRectTo({ x: 5, y: 5, width: 5000, height: 5000 }, FULL)).toEqual(FULL);
  });

  it('holds a point inside the image', () => {
    expect(clampPoint({ x: -5, y: 900 }, FULL)).toEqual({ x: 0, y: 600 });
  });

  describe('crop from a drag', () => {
    it('rounds to whole pixels so the saved size is exact', () => {
      expect(cropFromDrag({ x: 10.4, y: 20.6 }, { x: 110.6, y: 70.2 }, FULL)).toEqual({
        x: 10,
        y: 21,
        width: 101,
        height: 49,
      });
    });

    it('is the same whichever way it is dragged', () => {
      expect(cropFromDrag({ x: 110, y: 70 }, { x: 10, y: 20 }, FULL)).toEqual(
        cropFromDrag({ x: 10, y: 20 }, { x: 110, y: 70 }, FULL),
      );
    });

    it('stays inside the picture even when the pointer leaves it', () => {
      expect(cropFromDrag({ x: 900, y: 500 }, { x: 5000, y: 5000 }, FULL)).toEqual({
        x: 900,
        y: 500,
        width: 100,
        height: 100,
      });
      expect(cropFromDrag({ x: -50, y: -50 }, { x: 100, y: 100 }, FULL)).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    });

    it('is nothing when it is a click or too small', () => {
      expect(cropFromDrag({ x: 10, y: 10 }, { x: 10, y: 10 }, FULL)).toBeNull();
      expect(cropFromDrag({ x: 10, y: 10 }, { x: 10 + MIN_BOX - 1, y: 200 }, FULL)).toBeNull();
    });

    it('works inside a picture that is already cropped', () => {
      const view = { x: 200, y: 100, width: 300, height: 200 };
      expect(cropFromDrag({ x: 250, y: 150 }, { x: 900, y: 900 }, view)).toEqual({
        x: 250,
        y: 150,
        width: 250,
        height: 150,
      });
    });
  });

  it('never scales up, and fits the larger side', () => {
    expect(fitScale({ width: 400, height: 300 }, { width: 800, height: 600 })).toBe(1);
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5);
    expect(fitScale({ width: 1000, height: 2000 }, { width: 1000, height: 500 })).toBe(0.25);
    expect(fitScale({ width: 0, height: 0 }, { width: 10, height: 10 })).toBe(1);
  });

  it('maps between the screen and the image, and back, inside a crop', () => {
    const view = { x: 200, y: 100, width: 400, height: 300 };
    const scale = 0.5;
    const onScreen = { x: 50, y: 40 };
    const inImage = viewToImage(onScreen, view, scale);
    expect(inImage).toEqual({ x: 300, y: 180 });
    expect(imageToView(inImage, view, scale)).toEqual(onScreen);
  });

  it('measures the distance to a segment, including past its ends', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: 14, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  describe('resizing a box by a handle', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };

    it('moves only the edges the handle touches', () => {
      expect(resizeRect(rect, 'se', { x: 400, y: 300 }, FULL)).toEqual({
        x: 100,
        y: 100,
        width: 300,
        height: 200,
      });
      expect(resizeRect(rect, 'w', { x: 50, y: 999 }, FULL)).toEqual({
        x: 50,
        y: 100,
        width: 250,
        height: 100,
      });
      expect(resizeRect(rect, 'n', { x: 0, y: 40 }, FULL)).toEqual({
        x: 100,
        y: 40,
        width: 200,
        height: 160,
      });
    });

    it('never flips or goes below the minimum size', () => {
      const dragged = resizeRect(rect, 'e', { x: 0, y: 150 }, FULL);
      expect(dragged.width).toBe(MIN_BOX);
      expect(dragged.x).toBe(100);
      const up = resizeRect(rect, 's', { x: 150, y: 0 }, FULL);
      expect(up.height).toBe(MIN_BOX);
    });

    it('stays inside the image', () => {
      const out = resizeRect(rect, 'se', { x: 9999, y: 9999 }, FULL);
      expect(out.x + out.width).toBe(1000);
      expect(out.y + out.height).toBe(600);
    });

    it('finds the handle under a point', () => {
      expect(handleAt(rect, { x: 102, y: 99 }, 6)).toBe('nw');
      expect(handleAt(rect, { x: 200, y: 200 }, 6)).toBe('s');
      expect(handleAt(rect, { x: 200, y: 150 }, 6)).toBeNull();
    });
  });
});

describe('the edit document', () => {
  it('shows the whole image until it is cropped, and the output follows the crop', () => {
    expect(visibleRect(EMPTY_DOC, IMAGE)).toEqual(FULL);
    expect(outputSize(EMPTY_DOC, IMAGE)).toEqual(IMAGE);
    const cropped = setCrop(EMPTY_DOC, { x: 100, y: 50, width: 640, height: 360 });
    expect(outputSize(cropped, IMAGE)).toEqual({ width: 640, height: 360 });
  });

  it('adds, replaces and removes items without changing the document it was given', () => {
    const first = box(1, 10, 10, 50, 50);
    const doc = addItem(EMPTY_DOC, first);
    expect(EMPTY_DOC.items).toHaveLength(0);
    expect(nextId(doc)).toBe(2);
    const moved = replaceItem(doc, {
      ...first,
      rect: { x: 20, y: 20, width: 50, height: 50 },
    } as Item);
    expect(moved.items[0]).toMatchObject({ rect: { x: 20 } });
    expect(doc.items[0]).toMatchObject({ rect: { x: 10 } });
    expect(removeItem(moved, 1).items).toHaveLength(0);
  });

  it('makes every step undoable through the history', () => {
    let history = createHistory<Doc>(EMPTY_DOC);
    history = push(history, setCrop(history.present, { x: 0, y: 0, width: 500, height: 300 }));
    history = push(history, addItem(history.present, box(1, 10, 10, 50, 50)));
    history = push(history, setCrop(history.present, { x: 10, y: 10, width: 200, height: 100 }));
    expect(history.present.crop).toEqual({ x: 10, y: 10, width: 200, height: 100 });
    history = undo(history);
    expect(history.present.crop).toEqual({ x: 0, y: 0, width: 500, height: 300 });
    expect(history.present.items).toHaveLength(1);
    history = undo(undo(history));
    expect(history.present).toBe(EMPTY_DOC);
  });

  describe('picking an item', () => {
    const arrow: Item = {
      id: 1,
      kind: 'arrow',
      color: 'red',
      thickness: 'medium',
      from: { x: 100, y: 100 },
      to: { x: 300, y: 100 },
    };
    const outline = box(2, 400, 100, 200, 100);
    const blur: Item = {
      id: 3,
      kind: 'blur',
      color: 'black',
      thickness: 'thin',
      rect: { x: 700, y: 100, width: 100, height: 100 },
    };
    const text: Item = {
      id: 4,
      kind: 'text',
      color: 'green',
      thickness: 'medium',
      at: { x: 100, y: 300 },
      text: 'Hello',
    };
    const doc: Doc = { crop: null, items: [arrow, outline, blur, text] };

    it('picks an arrow near its line and not far from it', () => {
      expect(hitTest(doc, { x: 200, y: 103 }, 4)?.id).toBe(1);
      expect(hitTest(doc, { x: 200, y: 140 }, 4)).toBeNull();
    });

    it('picks a box by its edge, so what is inside it can still be reached', () => {
      expect(hitTest(doc, { x: 400, y: 150 }, 4)?.id).toBe(2);
      expect(hitTest(doc, { x: 500, y: 150 }, 4)).toBeNull();
    });

    it('picks a blur or text anywhere inside', () => {
      expect(hitTest(doc, { x: 750, y: 150 }, 4)?.id).toBe(3);
      expect(hitTest(doc, { x: 110, y: 310 }, 4)?.id).toBe(4);
    });

    it('picks the top most item when two overlap', () => {
      const over: Doc = { crop: null, items: [blur, { ...blur, id: 9 }] };
      expect(hitTest(over, { x: 750, y: 150 }, 4)?.id).toBe(9);
    });
  });

  describe('moving an item', () => {
    it('moves an arrow by both ends', () => {
      const arrow: Item = {
        id: 1,
        kind: 'arrow',
        color: 'red',
        thickness: 'thin',
        from: { x: 10, y: 10 },
        to: { x: 50, y: 20 },
      };
      expect(moveItem(arrow, 30, 40, FULL)).toMatchObject({
        from: { x: 40, y: 50 },
        to: { x: 80, y: 60 },
      });
    });

    it('stops at the edge of the picture and keeps its size', () => {
      const moved = moveItem(box(1, 900, 500, 80, 60), 500, 500, FULL);
      expect(moved).toMatchObject({ rect: { x: 920, y: 540, width: 80, height: 60 } });
    });

    it('moves text and keeps it inside', () => {
      const text: Item = {
        id: 1,
        kind: 'text',
        color: 'black',
        thickness: 'thin',
        at: { x: 10, y: 10 },
        text: 'Hi',
      };
      expect(moveItem(text, -100, -100, FULL)).toMatchObject({ at: { x: 0, y: 0 } });
      expect(boundsOf(text, fontSizeFor('thin')).height).toBeGreaterThan(0);
    });
  });
});
