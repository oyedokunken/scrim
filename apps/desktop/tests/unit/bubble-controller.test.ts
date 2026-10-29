import { describe, expect, it } from 'vitest';
import {
  createBubbleController,
  type BubbleDeps,
  type BubbleWindow,
} from '../../src/main/recording/bubble-controller';
import {
  BUBBLE,
  cornerPositions,
  type BubbleShape,
  type Corner,
  type Point,
} from '../../src/recorder/bubble/geometry';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const positions = cornerPositions(workArea, 52);

interface BubbleLook {
  corner: Corner;
  size: number;
  shape: BubbleShape;
}

function setup(
  options: {
    camera?: boolean;
    look?: BubbleLook;
    recording?: boolean;
  } = {},
) {
  const clock = { now: 10_000 };
  const timers: { id: number; callback: () => void; ms: number }[] = [];
  let nextId = 1;
  const placed: { circle: Point; side: string }[] = [];
  const records: unknown[] = [];
  const calls: string[] = [];
  const areaAsked: (string | undefined)[] = [];
  let cursor: Point = { x: 960, y: 500 };
  let dragStart: () => void = () => undefined;
  let dragEnd: (circle: Point) => void = () => undefined;
  const window: BubbleWindow = {
    open: (input) => {
      calls.push(
        `open ${String(input.circle.x)},${String(input.circle.y)} ${input.side} ${String(input.size)} ${input.shape}`,
      );
    },
    close: () => calls.push('close'),
    place: (circle, side) => placed.push({ circle, side }),
    onDragStart: (callback) => {
      dragStart = callback;
    },
    onDragEnd: (callback) => {
      dragEnd = callback;
    },
  };
  const deps: BubbleDeps = {
    window,
    devices: () =>
      options.recording === false
        ? undefined
        : {
            camera: { enabled: options.camera ?? true },
            mic: { enabled: true },
          },
    look: () => options.look ?? { corner: 'bl', size: 180, shape: 'circle' },
    area: (displayId) => {
      areaAsked.push(displayId);
      return { workArea, bottomInset: 52 };
    },
    cursor: () => cursor,
    now: () => clock.now,
    timers: {
      setInterval: (callback, ms) => {
        const id = nextId;
        nextId += 1;
        timers.push({ id, callback, ms });
        return id;
      },
      clearInterval: (handle) => {
        const index = timers.findIndex((timer) => timer.id === handle);
        if (index >= 0) timers.splice(index, 1);
      },
    },
    record: (keyframe) => records.push(keyframe),
  };
  const controller = createBubbleController(deps);
  /** Advances the fake clock and runs every timer once per step. */
  const advance = (ms: number, step = 16): void => {
    for (let spent = 0; spent < ms; spent += step) {
      clock.now += step;
      for (const timer of [...timers]) timer.callback();
    }
  };
  return {
    controller,
    clock,
    placed,
    records,
    calls,
    areaAsked,
    advance,
    setCursor: (point: Point) => {
      cursor = point;
    },
    drag: {
      start: () => {
        dragStart();
      },
      end: (circle: Point) => {
        dragEnd(circle);
      },
    },
    timers,
  };
}

describe('the camera bubble controller', () => {
  it('opens at the bottom left for a recording with the camera on, and notes the first position', () => {
    const t = setup();
    t.controller.start();
    expect(t.controller.isOpen()).toBe(true);
    expect(t.calls).toEqual([
      `open ${String(positions.bl.x)},${String(positions.bl.y)} right 180 circle`,
    ]);
    expect(t.records).toEqual([
      { corner: 'bl', x: positions.bl.x, y: positions.bl.y, size: BUBBLE.size },
    ]);
  });

  it('does not open when the camera is off', () => {
    const t = setup({ camera: false });
    t.controller.start();
    expect(t.controller.isOpen()).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('closes, stops watching and is safe to close again', () => {
    const t = setup();
    t.controller.start();
    expect(t.timers.length).toBeGreaterThan(0);
    t.controller.stop();
    t.controller.stop();
    expect(t.controller.isOpen()).toBe(false);
    expect(t.timers).toHaveLength(0);
    expect(t.calls.filter((call) => call === 'close')).toHaveLength(2);
  });

  it('steps to a free corner over 200 ms when the cursor comes close, and notes where it settled', () => {
    const t = setup();
    t.controller.start();
    t.clock.now += 2000;
    t.setCursor({ x: positions.bl.x + 90 + 90 + 50, y: positions.bl.y + 90 });
    t.advance(400);
    expect(t.controller.state().corner).toBe('tl');
    const last = t.records.at(-1);
    expect(last).toMatchObject({ corner: 'tl', x: positions.tl.x, y: positions.tl.y });
    // It was moved in several steps, not in one jump, and ended exactly on the corner.
    expect(t.placed.length).toBeGreaterThan(5);
    expect(t.placed.at(-1)?.circle).toEqual(positions.tl);
  });

  it('does not move again for at least 1.5 seconds', () => {
    const t = setup();
    t.controller.start();
    t.clock.now += 2000;
    t.setCursor({ x: positions.bl.x + 90 + 90 + 50, y: positions.bl.y + 90 });
    t.advance(300);
    expect(t.controller.state().corner).toBe('tl');
    const moves = t.records.length;
    // The cursor is now close to the new spot, but the cool down has not run out.
    t.setCursor({ x: positions.tl.x + 90 + 90 + 50, y: positions.tl.y + 90 });
    t.advance(1000);
    expect(t.records.length).toBe(moves);
    t.advance(800);
    expect(t.records.length).toBeGreaterThan(moves);
  });

  it('snaps to the nearest corner when dropped, and notes it', () => {
    const t = setup();
    t.controller.start();
    t.drag.start();
    t.drag.end({ x: positions.tr.x - 60, y: positions.tr.y + 40 });
    t.advance(400);
    expect(t.controller.state().corner).toBe('tr');
    expect(t.records.at(-1)).toMatchObject({ corner: 'tr', x: positions.tr.x, y: positions.tr.y });
    // The dot moved to the other side because the bubble is on the right now.
    expect(t.placed.at(-1)?.side).toBe('left');
  });

  it('never jumps away from the hand while it is being dragged', () => {
    const t = setup();
    t.controller.start();
    t.clock.now += 5000;
    t.drag.start();
    t.setCursor({ x: positions.bl.x + 90, y: positions.bl.y + 90 });
    t.advance(500);
    expect(t.controller.state().corner).toBe('bl');
    expect(t.records).toHaveLength(1);
  });

  it('ignores a drop after it has closed', () => {
    const t = setup();
    t.controller.start();
    t.controller.stop();
    t.drag.end({ x: 5, y: 5 });
    t.advance(400);
    expect(t.records).toHaveLength(1);
  });

  describe('before the countdown', () => {
    it('shows at the chosen corner on the display with the choice and notes nothing yet', () => {
      const t = setup({ recording: false });
      t.controller.preview({ displayId: '222', camera: {}, mic: { enabled: true } });
      expect(t.controller.isOpen()).toBe(true);
      expect(t.controller.isPreviewing()).toBe(true);
      expect(t.areaAsked).toContain('222');
      expect(t.records).toEqual([]);
      expect(t.calls).toHaveLength(1);
    });

    it('stays still when the cursor comes close, because nothing is recording yet', () => {
      const t = setup({ recording: false });
      t.controller.preview({ displayId: '1', camera: {}, mic: { enabled: true } });
      const before = t.controller.state().circle;
      t.setCursor({ x: before.x + 10, y: before.y + 10 });
      t.advance(4000);
      expect(t.controller.state().circle).toEqual(before);
      expect(t.records).toEqual([]);
    });

    it('goes live in place when the recording starts, with no second window and a first keyframe', () => {
      const t = setup();
      t.controller.preview({ displayId: '1', camera: {}, mic: { enabled: true } });
      t.controller.start();
      expect(t.calls.filter((call) => call.startsWith('open'))).toHaveLength(1);
      expect(t.calls).not.toContain('close');
      expect(t.controller.isPreviewing()).toBe(false);
      expect(t.records).toEqual([
        { corner: 'bl', x: positions.bl.x, y: positions.bl.y, size: BUBBLE.size },
      ]);
      expect(t.timers.length).toBeGreaterThan(0);
    });

    it('closes when the recording that started has no camera', () => {
      const t = setup({ camera: false });
      t.controller.preview({ displayId: '1', camera: {}, mic: { enabled: true } });
      t.controller.start();
      expect(t.controller.isOpen()).toBe(false);
      expect(t.calls).toContain('close');
    });

    it('takes the preview away when the choice is lost, and not a live bubble', () => {
      const t = setup({ recording: false });
      t.controller.preview({ displayId: '1', camera: {}, mic: { enabled: true } });
      t.controller.endPreview();
      expect(t.controller.isOpen()).toBe(false);
      const live = setup();
      live.controller.start();
      live.controller.endPreview();
      expect(live.controller.isOpen()).toBe(true);
    });
  });

  describe('the choices in settings', () => {
    it('starts at the chosen corner with the chosen size and shape', () => {
      const t = setup({ look: { corner: 'tr', size: 240, shape: 'rounded-square' } });
      const top = cornerPositions(workArea, 52, 240).tr;
      t.controller.start();
      expect(t.calls).toEqual([`open ${String(top.x)},${String(top.y)} left 240 rounded-square`]);
      expect(t.records).toEqual([{ corner: 'tr', x: top.x, y: top.y, size: 240 }]);
    });
  });
});
