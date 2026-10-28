import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clampPose,
  planZoom,
  sampleCamera,
  viewRect,
  type CameraKeyframe,
  type Frame,
  type InputEvent,
  type InputLog,
} from '../src/entry-zoom';

const EPSILON = 1e-6;

const frameArb: fc.Arbitrary<Frame> = fc.record({
  width: fc.integer({ min: 320, max: 3840 }),
  height: fc.integer({ min: 240, max: 2160 }),
});

const logArb: fc.Arbitrary<InputLog> = frameArb.chain((frame) => {
  const event: fc.Arbitrary<InputEvent> = fc.oneof(
    fc.record({
      type: fc.constant('move' as const),
      t: fc.integer({ min: 0, max: 60_000 }),
      x: fc.integer({ min: 0, max: frame.width }),
      y: fc.integer({ min: 0, max: frame.height }),
    }),
    fc.record({
      type: fc.constant('click' as const),
      t: fc.integer({ min: 0, max: 60_000 }),
      x: fc.integer({ min: 0, max: frame.width }),
      y: fc.integer({ min: 0, max: frame.height }),
      button: fc.constantFrom('left' as const, 'right' as const, 'middle' as const),
    }),
  );
  return fc.record({ frame: fc.constant(frame), events: fc.array(event, { maxLength: 60 }) });
});

const optionsArb = fc.record(
  {
    maxZoom: fc.double({ min: 1.2, max: 3, noNaN: true }),
    leadInMs: fc.integer({ min: 0, max: 1000 }),
    easeMs: fc.integer({ min: 100, max: 2000 }),
    holdMs: fc.integer({ min: 0, max: 3000 }),
    lookAheadMs: fc.integer({ min: 0, max: 400 }),
    deadZone: fc.double({ min: 0, max: 1, noNaN: true }),
  },
  { requiredKeys: [] },
);

const hasLeftClick = (log: InputLog): boolean =>
  log.events.some((e) => e.type === 'click' && e.button === 'left');

describe('planZoom properties', () => {
  it('keyframe times never decrease', () => {
    fc.assert(
      fc.property(logArb, optionsArb, (log, options) => {
        const times = planZoom(log, options).map((k) => k.t);
        for (let i = 1; i < times.length; i += 1) {
          expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] ?? 0);
        }
      }),
    );
  });

  it('scale stays between 1 and the maximum', () => {
    fc.assert(
      fc.property(logArb, optionsArb, (log, options) => {
        const max = options.maxZoom ?? 2;
        for (const keyframe of planZoom(log, options)) {
          expect(keyframe.pose.scale).toBeGreaterThanOrEqual(1);
          expect(keyframe.pose.scale).toBeLessThanOrEqual(max);
        }
      }),
    );
  });

  it('every keyframe view is inside the frame', () => {
    fc.assert(
      fc.property(logArb, optionsArb, (log, options) => {
        for (const keyframe of planZoom(log, options)) {
          const view = viewRect(keyframe.pose, log.frame);
          expect(view.x).toBeGreaterThanOrEqual(-EPSILON);
          expect(view.y).toBeGreaterThanOrEqual(-EPSILON);
          expect(view.x + view.width).toBeLessThanOrEqual(log.frame.width + EPSILON);
          expect(view.y + view.height).toBeLessThanOrEqual(log.frame.height + EPSILON);
        }
      }),
    );
  });

  it('the last keyframe returns to scale 1', () => {
    fc.assert(
      fc.property(logArb, optionsArb, (log, options) => {
        const keyframes = planZoom(log, options);
        if (keyframes.length > 0) {
          expect(keyframes[keyframes.length - 1]?.pose.scale).toBe(1);
        }
      }),
    );
  });

  it('plans keyframes exactly when there is a left click', () => {
    fc.assert(
      fc.property(logArb, (log) => {
        expect(planZoom(log).length > 0).toBe(hasLeftClick(log));
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(logArb, optionsArb, (log, options) => {
        expect(planZoom(log, options)).toEqual(planZoom(log, options));
      }),
    );
  });

  it('does not depend on the order events were logged in', () => {
    fc.assert(
      fc.property(logArb, (log) => {
        const reversed = { frame: log.frame, events: [...log.events].reverse() };
        const sortedTimes = (l: InputLog) => planZoom(l).map((k) => k.t);
        // Events with equal times may swap, so compare only logs with distinct times.
        const distinct = new Set(log.events.map((e) => e.t)).size === log.events.length;
        fc.pre(distinct);
        expect(sortedTimes(reversed)).toEqual(sortedTimes(log));
      }),
    );
  });
});

describe('sampleCamera properties', () => {
  const keyframeArb = (frame: Frame): fc.Arbitrary<CameraKeyframe[]> =>
    fc
      .array(
        fc.record({
          t: fc.integer({ min: 0, max: 20_000 }),
          pose: fc.record({
            scale: fc.double({ min: 0.1, max: 6, noNaN: true }),
            cx: fc.double({ min: -2 * frame.width, max: 3 * frame.width, noNaN: true }),
            cy: fc.double({ min: -2 * frame.height, max: 3 * frame.height, noNaN: true }),
          }),
          ease: fc.constantFrom('inOut' as const, 'linear' as const),
        }),
        { maxLength: 20 },
      )
      .map((keyframes) => keyframes.sort((a, b) => a.t - b.t));

  it('the sampled view stays inside the frame at any time', () => {
    fc.assert(
      fc.property(
        frameArb.chain((frame) =>
          fc.tuple(
            fc.constant(frame),
            keyframeArb(frame),
            fc.double({ min: -5000, max: 30_000, noNaN: true }),
          ),
        ),
        ([frame, keyframes, t]) => {
          const pose = sampleCamera(keyframes, t, frame);
          const view = viewRect(pose, frame);
          expect(pose.scale).toBeGreaterThanOrEqual(1);
          expect(view.x).toBeGreaterThanOrEqual(-EPSILON);
          expect(view.y).toBeGreaterThanOrEqual(-EPSILON);
          expect(view.x + view.width).toBeLessThanOrEqual(frame.width + EPSILON);
          expect(view.y + view.height).toBeLessThanOrEqual(frame.height + EPSILON);
        },
      ),
    );
  });

  it('a planned camera stays inside the frame while it plays', () => {
    fc.assert(
      fc.property(logArb, fc.integer({ min: -1000, max: 80_000 }), (log, t) => {
        const view = viewRect(sampleCamera(planZoom(log), t, log.frame), log.frame);
        expect(view.x).toBeGreaterThanOrEqual(-EPSILON);
        expect(view.x + view.width).toBeLessThanOrEqual(log.frame.width + EPSILON);
        expect(view.y).toBeGreaterThanOrEqual(-EPSILON);
        expect(view.y + view.height).toBeLessThanOrEqual(log.frame.height + EPSILON);
      }),
    );
  });
});

describe('clampPose properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(
        frameArb,
        fc.double({ min: 0, max: 8 }),
        fc.double({ min: -5000, max: 9000 }),
        fc.double({ min: -5000, max: 9000 }),
        (frame, scale, cx, cy) => {
          const once = clampPose({ scale, cx, cy }, frame);
          expect(clampPose(once, frame)).toEqual(once);
        },
      ),
    );
  });
});
