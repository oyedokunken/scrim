import { describe, expect, it } from 'vitest';
import {
  cursorAt,
  defaultZoomOptions,
  normalizeMoments,
  planCamera,
  planZoom,
  planZoomMoments,
  resolveZoomOptions,
  sampleCamera,
  viewRect,
  type Frame,
  type InputEvent,
  type InputLog,
} from '../src/entry-zoom';
import * as root from '../src/index';

const frame: Frame = { width: 1920, height: 1080 };

const click = (t: number, x: number, y: number, button: 'left' | 'right' | 'middle' = 'left') =>
  ({ type: 'click', t, x, y, button }) satisfies InputEvent;
const move = (t: number, x: number, y: number) => ({ type: 'move', t, x, y }) satisfies InputEvent;
const log = (...events: InputEvent[]): InputLog => ({ frame, events });

/** A cursor that sits still at a point for `ms`, as a stream of moves. */
function still(x: number, y: number, ms: number): InputEvent[] {
  const out: InputEvent[] = [];
  for (let t = 0; t <= ms; t += 16) out.push(move(t, x, y));
  return out;
}

const scaleAt = (keyframes: ReturnType<typeof planZoom>, t: number) =>
  sampleCamera(keyframes, t, frame).scale;

describe('defaults', () => {
  it('match the product spec', () => {
    expect(defaultZoomOptions).toEqual({
      maxZoom: 2,
      leadInMs: 250,
      easeMs: 480,
      holdMs: 1200,
      lookAheadMs: 120,
      deadZone: 0.5,
    });
  });
});

describe('planZoomMoments', () => {
  it('finds no moments without a left click', () => {
    expect(planZoomMoments(log())).toEqual([]);
    expect(planZoomMoments(log(click(500, 100, 100, 'right'), click(900, 5, 5, 'middle')))).toEqual(
      [],
    );
    expect(planZoomMoments(log(click(1000, 1, 1)), { maxZoom: 1 })).toEqual([]);
  });

  it('plans one moment from the lead in to the end of the hold', () => {
    expect(planZoomMoments(log(click(1000, 400, 300)))).toEqual([
      { startMs: 750, endMs: 2200, x: 400, y: 300 },
    ]);
  });

  it('never starts before time 0', () => {
    expect(planZoomMoments(log(click(100, 1, 1)))[0]?.startMs).toBe(0);
  });

  it('keeps nearby clicks in one moment aimed at the first click', () => {
    // The second click comes 1800 ms after the first: its zoom in would start before a zoom out
    // from the first could finish, so the camera stays in.
    const moments = planZoomMoments(log(click(1000, 200, 200), click(2800, 1700, 900)));
    expect(moments).toEqual([{ startMs: 750, endMs: 4000, x: 200, y: 200 }]);
  });

  it('plans separate moments for clicks that are far apart', () => {
    const moments = planZoomMoments(log(click(1000, 200, 200), click(9000, 1700, 900)));
    expect(moments.map((m) => [m.startMs, m.endMs])).toEqual([
      [750, 2200],
      [8750, 10200],
    ]);
  });

  it('ignores the order events were logged in', () => {
    const a = planZoomMoments(log(click(9000, 100, 100), click(1000, 960, 540)));
    const b = planZoomMoments(log(click(1000, 960, 540), click(9000, 100, 100)));
    expect(a).toEqual(b);
  });
});

describe('normalizeMoments', () => {
  it('sorts, drops empty ones and joins overlaps', () => {
    const out = normalizeMoments([
      { startMs: 5000, endMs: 6000, x: 1, y: 1 },
      { startMs: 1000, endMs: 3000, x: 2, y: 2 },
      { startMs: 2500, endMs: 4000, x: 3, y: 3 },
      { startMs: 7000, endMs: 7000, x: 4, y: 4 },
    ]);
    expect(out).toEqual([
      { startMs: 1000, endMs: 4000, x: 2, y: 2 },
      { startMs: 5000, endMs: 6000, x: 1, y: 1 },
    ]);
  });
});

describe('planZoom', () => {
  it('returns no keyframes for an empty log or without left clicks', () => {
    expect(planZoom(log())).toEqual([]);
    expect(planZoom(log(move(0, 10, 10), click(500, 100, 100, 'right')))).toEqual([]);
    expect(planZoom(log(click(1000, 400, 300)), { maxZoom: 1 })).toEqual([]);
  });

  it('starts and ends on the whole frame and zooms in the middle', () => {
    const keyframes = planZoom({
      frame,
      events: [...still(960, 540, 8000), click(1000, 960, 540)],
    });
    const first = keyframes[0];
    const last = keyframes[keyframes.length - 1];
    expect(first?.pose.scale).toBe(1);
    expect(last?.pose).toEqual({ scale: 1, cx: 960, cy: 540 });
    expect(scaleAt(keyframes, 700)).toBeCloseTo(1, 1);
    expect(scaleAt(keyframes, 1800)).toBeCloseTo(2, 1);
    expect(scaleAt(keyframes, 6000)).toBe(1);
  });

  it('zooms in before the click lands and is mostly there when it does', () => {
    const keyframes = planZoom({
      frame,
      events: [...still(960, 540, 8000), click(1000, 960, 540)],
    });
    expect(scaleAt(keyframes, 1000)).toBeGreaterThan(1.5);
    expect(scaleAt(keyframes, 700)).toBeLessThan(1.05);
  });

  it('eases out after the hold: still zoomed during it, back at rest within two eases', () => {
    const events = [...still(960, 540, 8000), click(1000, 960, 540)];
    const keyframes = planZoom({ frame, events }, { holdMs: 1200, easeMs: 480, maxZoom: 2 });
    expect(scaleAt(keyframes, 2100)).toBeGreaterThan(1.95);
    expect(scaleAt(keyframes, 2200 + 2 * 480)).toBeLessThan(1.02);
  });

  it('aims at the first click and keeps the zoom center inside the frame in a corner', () => {
    const keyframes = planZoom({ frame, events: [...still(4, 4, 6000), click(1000, 4, 4)] });
    const pose = sampleCamera(keyframes, 1800, frame);
    expect(pose.cx).toBeCloseTo(480, 0);
    expect(pose.cy).toBeCloseTo(270, 0);
  });

  it('honors a custom zoom level', () => {
    const keyframes = planZoom(log(click(1000, 960, 540)), { maxZoom: 3 });
    expect(Math.max(...keyframes.map((k) => k.pose.scale))).toBeLessThanOrEqual(3);
    expect(Math.max(...keyframes.map((k) => k.pose.scale))).toBeGreaterThan(2.95);
  });

  it('stays zoomed between nearby clicks instead of zooming out and in', () => {
    const events = [...still(960, 540, 9000), click(1000, 960, 540), click(2800, 960, 540)];
    const keyframes = planZoom({ frame, events });
    let lowest = Infinity;
    for (let t = 1500; t <= 3500; t += 20) lowest = Math.min(lowest, scaleAt(keyframes, t));
    expect(lowest).toBeGreaterThan(1.95);
  });

  it('zooms fully out between clicks that are far apart', () => {
    const events = [...still(960, 540, 12_000), click(1000, 960, 540), click(8000, 960, 540)];
    const keyframes = planZoom({ frame, events });
    expect(scaleAt(keyframes, 5000)).toBe(1);
    expect(scaleAt(keyframes, 8900)).toBeGreaterThan(1.9);
  });

  it('follows the cursor once it leaves the inner part of the view', () => {
    const events: InputEvent[] = [click(1000, 960, 540)];
    for (let t = 0; t <= 6000; t += 16) {
      events.push(move(t, t < 1500 ? 960 : Math.min(1700, 960 + (t - 1500) * 0.5), 540));
    }
    const keyframes = planZoom(log(...events), { holdMs: 4000 });
    const pose = sampleCamera(keyframes, 4000, frame);
    expect(pose.cx).toBeGreaterThan(1150);
    // The cursor is always inside the view.
    for (let t = 1500; t <= 5000; t += 50) {
      const view = viewRect(sampleCamera(keyframes, t, frame), frame);
      const x = cursorAt(
        events.sort((a, b) => a.t - b.t),
        t,
        frame,
      ).x;
      expect(x).toBeGreaterThanOrEqual(view.x - 1);
      expect(x).toBeLessThanOrEqual(view.x + view.width + 1);
    }
  });

  it('does not pan while the cursor stays near the middle', () => {
    const events: InputEvent[] = [click(1000, 960, 540)];
    for (let t = 0; t <= 5000; t += 16) {
      events.push(move(t, 960 + 60 * Math.sin(t / 200), 540 + 40 * Math.cos(t / 170)));
    }
    const keyframes = planZoom(log(...events));
    const centers: number[] = [];
    for (let t = 1500; t <= 2100; t += 20) centers.push(sampleCamera(keyframes, t, frame).cx);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
  });

  it('moves smoothly: no step in position or scale between frames', () => {
    const events: InputEvent[] = [click(1000, 300, 300), click(3000, 1600, 800)];
    for (let t = 0; t <= 8000; t += 16) {
      events.push(
        move(t, 300 + (1300 * Math.min(t, 3000)) / 3000, 300 + (500 * Math.min(t, 3000)) / 3000),
      );
    }
    const keyframes = planZoom(log(...events));
    let previous = sampleCamera(keyframes, 0, frame);
    let lastScaleStep = 0;
    let lastPanX = 0;
    let worstScaleJump = 0;
    let worstPanJump = 0;
    for (let t = 16; t <= 9000; t += 16) {
      const pose = sampleCamera(keyframes, t, frame);
      const scaleStep = pose.scale - previous.scale;
      const panX = pose.cx - previous.cx;
      // Acceleration: how much the per frame step itself changes. A corner shows up here.
      worstScaleJump = Math.max(worstScaleJump, Math.abs(scaleStep - lastScaleStep));
      worstPanJump = Math.max(worstPanJump, Math.abs(panX - lastPanX));
      lastScaleStep = scaleStep;
      lastPanX = panX;
      previous = pose;
    }
    expect(worstScaleJump).toBeLessThan(0.01);
    // The aim is near a corner here, so the view edge clamp bends the path a little.
    expect(worstPanJump).toBeLessThan(6);
  });

  it('never overshoots the zoom level or the frame', () => {
    const events = [click(1000, 1900, 1070), click(1500, 10, 10), click(2500, 1900, 10)];
    const keyframes = planZoom(log(...events), { maxZoom: 2.4 });
    for (const k of keyframes) {
      expect(k.pose.scale).toBeLessThanOrEqual(2.4);
      const view = viewRect(k.pose, frame);
      expect(view.x).toBeGreaterThanOrEqual(-1e-6);
      expect(view.y).toBeGreaterThanOrEqual(-1e-6);
      expect(view.x + view.width).toBeLessThanOrEqual(frame.width + 1e-6);
      expect(view.y + view.height).toBeLessThanOrEqual(frame.height + 1e-6);
    }
  });

  it('a snappier motion arrives sooner than a gentle one', () => {
    const events = [...still(960, 540, 6000), click(1000, 960, 540)];
    const snappy = planZoom({ frame, events }, { easeMs: 300 });
    const gentle = planZoom({ frame, events }, { easeMs: 850 });
    expect(scaleAt(snappy, 1100)).toBeGreaterThan(scaleAt(gentle, 1100));
  });

  it('keeps keyframes in time order when events arrive unsorted', () => {
    const keyframes = planZoom(log(click(9000, 100, 100), click(1000, 960, 540)));
    const times = keyframes.map((k) => k.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('does not modify the log it is given', () => {
    const events = [click(9000, 100, 100), click(1000, 960, 540)];
    const snapshot = structuredClone(events);
    planZoom({ frame, events });
    expect(events).toEqual(snapshot);
  });

  it('is deterministic', () => {
    const l = log(click(1000, 200, 300), move(1500, 900, 400), click(4000, 1700, 900));
    expect(planZoom(l)).toEqual(planZoom(l));
  });

  it('plans from edited moments: a manual moment zooms where the editor said', () => {
    const keyframes = planCamera([{ startMs: 2000, endMs: 4000, x: 1800, y: 100 }], log());
    const pose = sampleCamera(keyframes, 3500, frame);
    expect(pose.scale).toBeGreaterThan(1.95);
    expect(pose.cx).toBeGreaterThan(1400);
    expect(pose.cy).toBeLessThan(400);
    expect(sampleCamera(keyframes, 9000, frame).scale).toBe(1);
  });

  it('plans nothing for an empty moment list, so deleting every zoom turns it off', () => {
    expect(planCamera([], log(click(1000, 1, 1)))).toEqual([]);
  });

  it('a deleted moment leaves the others alone', () => {
    const all = planZoomMoments(log(click(1000, 200, 200), click(9000, 1700, 900)));
    const kept = planCamera(all.slice(1), log(click(1000, 200, 200), click(9000, 1700, 900)));
    expect(scaleAt(kept, 1800)).toBe(1);
    expect(scaleAt(kept, 9800)).toBeGreaterThan(1.9);
  });
});

describe('resolveZoomOptions', () => {
  it('fills in defaults', () => {
    expect(resolveZoomOptions({})).toEqual(defaultZoomOptions);
    expect(resolveZoomOptions({ maxZoom: 2.5 }).maxZoom).toBe(2.5);
  });

  it.each([
    [{ maxZoom: 0.9 }, /maxZoom/],
    [{ maxZoom: Number.NaN }, /finite/],
    [{ easeMs: 0 }, /easeMs/],
    [{ holdMs: -1 }, /holdMs/],
    [{ leadInMs: -1 }, /leadInMs/],
    [{ lookAheadMs: -1 }, /lookAheadMs/],
    [{ deadZone: 2 }, /deadZone/],
  ])('rejects %j', (options, message) => {
    expect(() => resolveZoomOptions(options)).toThrow(message);
  });

  it('is enforced by planZoom', () => {
    expect(() => planZoom(log(click(0, 1, 1)), { maxZoom: 0 })).toThrow(RangeError);
  });
});

describe('cursorAt', () => {
  const events = [move(0, 0, 0), move(1000, 100, 200), move(2000, 300, 200)];

  it('puts the cursor at the center for an empty log', () => {
    expect(cursorAt([], 5, frame)).toEqual({ x: 960, y: 540 });
  });

  it('holds the nearest position outside the logged range', () => {
    expect(cursorAt(events, -50, frame)).toEqual({ x: 0, y: 0 });
    expect(cursorAt(events, 9000, frame)).toEqual({ x: 300, y: 200 });
  });

  it('interpolates between positions', () => {
    expect(cursorAt(events, 500, frame)).toEqual({ x: 50, y: 100 });
    expect(cursorAt(events, 1500, frame)).toEqual({ x: 200, y: 200 });
  });

  it('copes with two events at the same time', () => {
    const doubled = [move(0, 0, 0), move(1000, 10, 10), move(1000, 50, 50), move(2000, 90, 90)];
    expect(cursorAt(doubled, 1000, frame)).toEqual({ x: 50, y: 50 });
  });
});

describe('subpath entry', () => {
  it('exposes the planner and the camera', () => {
    expect(typeof planZoom).toBe('function');
    expect(typeof sampleCamera).toBe('function');
  });

  it('matches the root entry for the same functions', () => {
    expect(root.planZoom).toBe(planZoom);
    expect(root.sampleCamera).toBe(sampleCamera);
  });
});

describe('planZoom with a very short hold', () => {
  it('never plans a keyframe before the previous one', () => {
    const keyframes = planZoom(
      {
        frame: { width: 2210, height: 1681 },
        events: [
          { type: 'click', t: 0, x: 0, y: 0, button: 'left' },
          { type: 'click', t: 252, x: 0, y: 0, button: 'left' },
        ],
      },
      { easeMs: 100, holdMs: 0 },
    );
    const times = keyframes.map((keyframe) => keyframe.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
