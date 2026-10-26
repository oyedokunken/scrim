import fc from 'fast-check';
import { clampPose, sampleCamera, viewRect, type CameraPose } from '@scrim/core/zoom';
import { describe, expect, it } from 'vitest';
import { DemoPlayer } from '@/lib/demo/player';
import { poseToTransform } from '@/lib/demo/pose-to-transform';
import {
  DEMO_CLICKS,
  DEMO_DURATION_MS,
  DEMO_FRAME,
  DEMO_KEYFRAMES,
  DEMO_LOG,
  DEMO_WAYPOINTS,
  STATIC_FRAME_TIME_MS,
  buildDemoLog,
} from '@/lib/demo/script';
import { ManualClock } from './support/manual-clock';

describe('the scripted demo path', () => {
  it('is deterministic', () => {
    expect(buildDemoLog()).toEqual(buildDemoLog());
  });

  it('has three left clicks at different places', () => {
    expect(DEMO_CLICKS).toHaveLength(3);
    expect(DEMO_CLICKS.every((click) => click.button === 'left')).toBe(true);
    const places = new Set(DEMO_CLICKS.map((click) => `${String(click.x)},${String(click.y)}`));
    expect(places.size).toBe(3);
  });

  it('runs for about 10 seconds and loops back to where it began', () => {
    expect(DEMO_DURATION_MS).toBe(10_000);
    const first = DEMO_WAYPOINTS[0];
    const last = DEMO_WAYPOINTS[DEMO_WAYPOINTS.length - 1];
    expect(last?.t).toBe(DEMO_DURATION_MS);
    expect({ x: last?.x, y: last?.y }).toEqual({ x: first?.x, y: first?.y });
  });

  it('keeps every logged event inside the frame and in time order', () => {
    let previous = 0;
    for (const event of DEMO_LOG.events) {
      expect(event.t).toBeGreaterThanOrEqual(previous);
      expect(event.x).toBeGreaterThanOrEqual(0);
      expect(event.x).toBeLessThanOrEqual(DEMO_FRAME.width);
      expect(event.y).toBeGreaterThanOrEqual(0);
      expect(event.y).toBeLessThanOrEqual(DEMO_FRAME.height);
      previous = event.t;
    }
  });

  it('gets its camera from the real planner, with keyframes in time order', () => {
    expect(DEMO_KEYFRAMES.length).toBeGreaterThan(6);
    const times = DEMO_KEYFRAMES.map((keyframe) => keyframe.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('zooms out fully only twice: after the first click, and at the end of the merged pan', () => {
    const rests = DEMO_KEYFRAMES.filter((keyframe) => keyframe.pose.scale === 1).map((k) => k.t);
    expect(rests).toEqual([1250, 3150, 4550, 8250]);
  });

  it('ends the loop at rest, before the cursor starts again', () => {
    const last = DEMO_KEYFRAMES[DEMO_KEYFRAMES.length - 1];
    expect(last?.pose.scale).toBe(1);
    expect(last?.t).toBeLessThan(DEMO_DURATION_MS);
    expect(sampleCamera(DEMO_KEYFRAMES, 0, DEMO_FRAME).scale).toBe(1);
    expect(sampleCamera(DEMO_KEYFRAMES, DEMO_DURATION_MS - 1, DEMO_FRAME).scale).toBe(1);
  });

  it('is zoomed in on the static frame shown for reduced motion', () => {
    expect(sampleCamera(DEMO_KEYFRAMES, STATIC_FRAME_TIME_MS, DEMO_FRAME).scale).toBe(2);
  });

  it('pans across to the third click instead of zooming out and back in', () => {
    const during = sampleCamera(DEMO_KEYFRAMES, 5000, DEMO_FRAME);
    const after = sampleCamera(DEMO_KEYFRAMES, 7500, DEMO_FRAME);
    expect(during.scale).toBe(2);
    expect(after.scale).toBe(2);
    expect(after.cx).toBeGreaterThan(during.cx);
    expect(after.cy).toBeGreaterThan(during.cy);
  });

  it('never lets the view leave the frame at any time in the loop', () => {
    for (let t = 0; t <= DEMO_DURATION_MS; t += 50) {
      const view = viewRect(sampleCamera(DEMO_KEYFRAMES, t, DEMO_FRAME), DEMO_FRAME);
      expect(view.x).toBeGreaterThanOrEqual(-1e-6);
      expect(view.y).toBeGreaterThanOrEqual(-1e-6);
      expect(view.x + view.width).toBeLessThanOrEqual(DEMO_FRAME.width + 1e-6);
      expect(view.y + view.height).toBeLessThanOrEqual(DEMO_FRAME.height + 1e-6);
    }
  });
});

describe('poseToTransform', () => {
  const frame = DEMO_FRAME;

  it('is the identity for the full frame', () => {
    expect(poseToTransform({ scale: 1, cx: 640, cy: 360 }, frame)).toBe(
      'translate(0%, 0%) scale(1)',
    );
  });

  it('centers a 2x zoom by shifting half the frame', () => {
    expect(poseToTransform({ scale: 2, cx: 640, cy: 360 }, frame)).toBe(
      'translate(-50%, -50%) scale(2)',
    );
  });

  it('shows the top left corner with no shift and the bottom right with a full shift', () => {
    expect(poseToTransform({ scale: 2, cx: 320, cy: 180 }, frame)).toBe(
      'translate(0%, 0%) scale(2)',
    );
    expect(poseToTransform({ scale: 2, cx: 960, cy: 540 }, frame)).toBe(
      'translate(-100%, -100%) scale(2)',
    );
  });

  it('never prints a negative zero or a long fraction', () => {
    const text = poseToTransform({ scale: 1.3333333333, cx: 640, cy: 360 }, frame);
    expect(text).not.toContain('-0%');
    expect(text).not.toMatch(/\d\.\d{5,}/);
  });

  it('puts the view exactly on the screen for any valid pose', () => {
    const poseArb = fc.record({
      scale: fc.double({ min: 1, max: 4, noNaN: true }),
      cx: fc.double({ min: 0, max: frame.width, noNaN: true }),
      cy: fc.double({ min: 0, max: frame.height, noNaN: true }),
    });
    fc.assert(
      fc.property(poseArb, (raw) => {
        const pose: CameraPose = clampPose(raw, frame);
        const match = /translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\(([\d.]+)\)/.exec(
          poseToTransform(pose, frame),
        );
        const [tx, ty, scale] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
        const view = viewRect(pose, frame);
        // Screen position of a scene point is scale * point + translate (in pixels).
        const screenLeft = scale * view.x + (tx / 100) * frame.width;
        const screenTop = scale * view.y + (ty / 100) * frame.height;
        const screenRight = scale * (view.x + view.width) + (tx / 100) * frame.width;
        const screenBottom = scale * (view.y + view.height) + (ty / 100) * frame.height;
        expect(Math.abs(screenLeft)).toBeLessThan(0.5);
        expect(Math.abs(screenTop)).toBeLessThan(0.5);
        expect(Math.abs(screenRight - frame.width)).toBeLessThan(0.5);
        expect(Math.abs(screenBottom - frame.height)).toBeLessThan(0.5);
      }),
    );
  });
});

describe('DemoPlayer', () => {
  function setup(durationMs = 1000) {
    const clock = new ManualClock();
    const frames: number[] = [];
    const player = new DemoPlayer({ durationMs, clock, onFrame: (t) => frames.push(t) });
    return { clock, frames, player };
  }

  it('rejects a loop with no length', () => {
    const clock = new ManualClock();
    expect(() => new DemoPlayer({ durationMs: 0, clock, onFrame: () => undefined })).toThrow(
      RangeError,
    );
  });

  it('does nothing until played', () => {
    const { clock, frames, player } = setup();
    clock.advance(500);
    expect(frames).toEqual([]);
    expect(player.isPlaying).toBe(false);
    expect(player.time).toBe(0);
  });

  it('advances with the clock, one frame at a time', () => {
    const { clock, frames, player } = setup();
    player.play();
    clock.advance(48);
    expect(frames).toEqual([16, 32, 48]);
    expect(player.isPlaying).toBe(true);
  });

  it('loops back to the start at the end of the timeline', () => {
    const { clock, frames, player } = setup(100);
    player.play();
    clock.advance(112);
    expect(frames[frames.length - 1]).toBe(12);
    expect(Math.max(...frames)).toBeLessThan(100);
  });

  it('pauses, keeps its place and stops asking for frames', () => {
    const { clock, frames, player } = setup();
    player.play();
    clock.advance(64);
    player.pause();
    expect(clock.pending).toBe(0);
    const count = frames.length;
    clock.advance(500);
    expect(frames).toHaveLength(count);
    expect(player.time).toBe(64);
    expect(player.isPlaying).toBe(false);
  });

  it('resumes from where it paused, ignoring the time spent paused', () => {
    const { clock, frames, player } = setup();
    player.play();
    clock.advance(64);
    player.pause();
    clock.skip(10_000);
    player.play();
    clock.advance(16);
    expect(frames[frames.length - 1]).toBe(80);
  });

  it('ignores a second play while already playing', () => {
    const { clock, player } = setup();
    player.play();
    player.play();
    expect(clock.pending).toBe(1);
  });

  it('limits a long gap, so a sleeping tab does not make the demo jump', () => {
    const { clock, frames, player } = setup(100_000);
    player.play();
    clock.skip(60_000);
    clock.advance(16);
    expect(frames[frames.length - 1]).toBeLessThanOrEqual(250);
  });

  it('seeks, wraps and draws the frame', () => {
    const { frames, player } = setup(1000);
    player.seek(2500);
    expect(player.time).toBe(500);
    player.seek(-200);
    expect(player.time).toBe(800);
    expect(frames).toEqual([500, 800]);
  });

  it('refreshes the current frame without moving', () => {
    const { frames, player } = setup();
    player.seek(300);
    player.refresh();
    expect(frames).toEqual([300, 300]);
  });

  it('stops everything when disposed', () => {
    const { clock, player } = setup();
    player.play();
    player.dispose();
    expect(clock.pending).toBe(0);
  });
});
