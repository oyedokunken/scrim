import { describe, expect, it } from 'vitest';
import {
  cursorAt,
  defaultZoomOptions,
  planZoom,
  resolveZoomOptions,
  sampleCamera,
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

describe('defaults', () => {
  it('match the product spec', () => {
    expect(defaultZoomOptions).toEqual({
      maxZoom: 2,
      leadInMs: 250,
      easeMs: 450,
      holdMs: 1200,
      mergeWindowMs: 1500,
      followIntervalMs: 300,
    });
  });
});

describe('planZoom', () => {
  it('returns no keyframes for an empty log', () => {
    expect(planZoom(log())).toEqual([]);
  });

  it('returns no keyframes when there are no left clicks', () => {
    const noClicks = log(
      move(0, 10, 10),
      click(500, 100, 100, 'right'),
      click(900, 5, 5, 'middle'),
    );
    expect(planZoom(noClicks)).toEqual([]);
  });

  it('returns no keyframes when maxZoom is 1', () => {
    expect(planZoom(log(click(1000, 400, 300)), { maxZoom: 1 })).toEqual([]);
  });

  it('plans lead in, ease in, follow, hold and ease out around one click', () => {
    const keyframes = planZoom(log(click(1000, 960, 540)));
    expect(keyframes.map((k) => k.t)).toEqual([750, 1200, 1500, 1800, 2100, 2200, 2650]);
    expect(keyframes.map((k) => k.pose.scale)).toEqual([1, 2, 2, 2, 2, 2, 1]);
    expect(keyframes[1]?.pose).toEqual({ scale: 2, cx: 960, cy: 540 });
    expect(keyframes[6]?.pose).toEqual({ scale: 1, cx: 960, cy: 540 });
  });

  it('starts the zoom no earlier than time 0', () => {
    const keyframes = planZoom(log(click(100, 960, 540)));
    expect(keyframes[0]?.t).toBe(0);
  });

  it('keeps the zoom center inside the frame for a click in the corner', () => {
    const keyframes = planZoom(log(click(1000, 4, 4)));
    expect(keyframes[1]?.pose).toEqual({ scale: 2, cx: 480, cy: 270 });
  });

  it('honors a custom zoom level', () => {
    const keyframes = planZoom(log(click(1000, 960, 540)), { maxZoom: 3 });
    expect(Math.max(...keyframes.map((k) => k.pose.scale))).toBe(3);
  });

  it('treats clicks inside the merge window as one burst', () => {
    // 1200 ms apart is inside the 1500 ms window: one zoom from 750 to 3400, out by 3850.
    const keyframes = planZoom(log(click(1000, 960, 540), click(2200, 960, 540)));
    const rests = keyframes.filter((k) => k.pose.scale === 1);
    expect(rests.map((k) => k.t)).toEqual([750, 3850]);
  });

  it('zooms out between bursts that are far apart', () => {
    const keyframes = planZoom(log(click(1000, 960, 540), click(9000, 960, 540)));
    const rests = keyframes.filter((k) => k.pose.scale === 1);
    expect(rests.map((k) => k.t)).toEqual([750, 2650, 8750, 10650]);
  });

  it('merges bursts whose gap is too short for a full zoom out and pans instead', () => {
    // Separate bursts (1800 ms apart, window 500). Burst one holds until 2200 and its zoom out
    // would finish at 2650, but burst two starts easing in at 2550, so the camera stays zoomed.
    const merged = planZoom(log(click(1000, 200, 200), click(2800, 1700, 900)), {
      mergeWindowMs: 500,
    });
    const rests = merged.filter((k) => k.pose.scale === 1);
    expect(rests.map((k) => k.t)).toEqual([750, 4450]);
  });

  it('zooms out fully when the next burst starts after the zoom out could finish', () => {
    const apart = planZoom(log(click(1000, 200, 200), click(3000, 1700, 900)), {
      mergeWindowMs: 500,
    });
    const rests = apart.filter((k) => k.pose.scale === 1);
    expect(rests.map((k) => k.t)).toEqual([750, 2650, 2750, 4650]);
  });

  it('pans with the cursor once it leaves the inner part of the view', () => {
    const keyframes = planZoom(
      log(click(1000, 960, 540), move(1500, 1000, 540), move(2100, 1700, 540)),
    );
    const centers = keyframes.filter((k) => k.pose.scale === 2).map((k) => k.pose.cx);
    expect(centers[0]).toBe(960);
    expect(Math.max(...centers)).toBeGreaterThan(960);
  });

  it('does not pan while the cursor stays near the middle', () => {
    const keyframes = planZoom(
      log(click(1000, 960, 540), move(1500, 1000, 560), move(2100, 940, 520)),
    );
    const centers = new Set(keyframes.filter((k) => k.pose.scale === 2).map((k) => k.pose.cx));
    expect(centers).toEqual(new Set([960]));
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

  it('extends a hold to at least the ease in when hold is very short', () => {
    const keyframes = planZoom(log(click(1000, 960, 540)), { holdMs: 0, leadInMs: 0 });
    const times = keyframes.map((k) => k.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(keyframes.some((k) => k.pose.scale === 2)).toBe(true);
  });

  it('the camera is zoomed on the click and back at rest after the plan', () => {
    const keyframes = planZoom(log(click(1000, 960, 540)));
    expect(sampleCamera(keyframes, 1500, frame).scale).toBe(2);
    expect(sampleCamera(keyframes, 5000, frame).scale).toBe(1);
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
    [{ followIntervalMs: 0 }, /followIntervalMs/],
    [{ easeMs: -1 }, /easeMs/],
    [{ holdMs: -1 }, /holdMs/],
    [{ leadInMs: -1 }, /leadInMs/],
    [{ mergeWindowMs: -1 }, /mergeWindowMs/],
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

describe('planZoom with a hold shorter than the ease', () => {
  // Found by the property test: a hold of zero and an ease of 2 ms put the second zoom in before the
  // first zoom out had finished, so keyframe times went backwards.
  it('never plans a keyframe before the previous one', () => {
    const keyframes = planZoom(
      {
        frame: { width: 2210, height: 1681 },
        events: [
          { type: 'click', t: 0, x: 0, y: 0, button: 'left' },
          { type: 'click', t: 252, x: 0, y: 0, button: 'left' },
        ],
      },
      { easeMs: 2, holdMs: 0, mergeWindowMs: 0 },
    );
    const times = keyframes.map((keyframe) => keyframe.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
