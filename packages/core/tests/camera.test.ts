import { describe, expect, it } from 'vitest';
import {
  clampPose,
  easeInOutCubic,
  identityPose,
  sampleCamera,
  viewRect,
  type CameraKeyframe,
  type Frame,
} from '../src/entry-zoom';

const frame: Frame = { width: 1920, height: 1080 };

describe('identityPose', () => {
  it('looks at the whole frame from its center', () => {
    expect(identityPose(frame)).toEqual({ scale: 1, cx: 960, cy: 540 });
  });
});

describe('clampPose', () => {
  it('leaves a valid pose alone', () => {
    const pose = { scale: 2, cx: 960, cy: 540 };
    expect(clampPose(pose, frame)).toEqual(pose);
  });

  it('pulls a corner target inside so the view stays in the frame', () => {
    expect(clampPose({ scale: 2, cx: 10, cy: 10 }, frame)).toEqual({ scale: 2, cx: 480, cy: 270 });
    expect(clampPose({ scale: 2, cx: 5000, cy: 5000 }, frame)).toEqual({
      scale: 2,
      cx: 1440,
      cy: 810,
    });
  });

  it('never zooms out past the full frame', () => {
    expect(clampPose({ scale: 0.4, cx: 0, cy: 0 }, frame)).toEqual(identityPose(frame));
  });

  it('replaces non finite values with the identity pose', () => {
    expect(
      clampPose({ scale: Number.NaN, cx: Number.NaN, cy: Number.POSITIVE_INFINITY }, frame),
    ).toEqual(identityPose(frame));
  });
});

describe('viewRect', () => {
  it('shows half the frame at 2x', () => {
    expect(viewRect({ scale: 2, cx: 960, cy: 540 }, frame)).toEqual({
      x: 480,
      y: 270,
      width: 960,
      height: 540,
    });
  });
});

describe('easeInOutCubic', () => {
  it('runs from 0 to 1 through 0.5', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('starts and ends slowly', () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });

  it('clamps progress outside 0 to 1', () => {
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(4)).toBe(1);
  });
});

describe('sampleCamera', () => {
  const rest = identityPose(frame);
  const zoomed = { scale: 2, cx: 960, cy: 540 };
  const keyframes: CameraKeyframe[] = [
    { t: 1000, pose: rest, ease: 'inOut' },
    { t: 2000, pose: zoomed, ease: 'inOut' },
    { t: 3000, pose: { scale: 2, cx: 1200, cy: 540 }, ease: 'linear' },
  ];

  it('shows the whole frame when there are no keyframes', () => {
    expect(sampleCamera([], 500, frame)).toEqual(rest);
  });

  it('holds the first pose before the first keyframe and the last after the last', () => {
    expect(sampleCamera(keyframes, 0, frame)).toEqual(rest);
    expect(sampleCamera(keyframes, 9000, frame)).toEqual({ scale: 2, cx: 1200, cy: 540 });
  });

  it('hits each keyframe exactly', () => {
    expect(sampleCamera(keyframes, 1000, frame)).toEqual(rest);
    expect(sampleCamera(keyframes, 2000, frame)).toEqual(zoomed);
  });

  it('eases through the midpoint of an in out segment', () => {
    const mid = sampleCamera(keyframes, 1500, frame);
    expect(mid.scale).toBeCloseTo(1.5, 10);
  });

  it('is slower than linear near the start of an in out segment', () => {
    expect(sampleCamera(keyframes, 1100, frame).scale).toBeLessThan(1.1);
  });

  it('moves at constant speed on a linear segment', () => {
    expect(sampleCamera(keyframes, 2250, frame).cx).toBeCloseTo(1020, 10);
    expect(sampleCamera(keyframes, 2500, frame).cx).toBeCloseTo(1080, 10);
  });

  it('copes with two keyframes at the same time', () => {
    const doubled: CameraKeyframe[] = [
      { t: 0, pose: rest, ease: 'inOut' },
      { t: 1000, pose: rest, ease: 'inOut' },
      { t: 1000, pose: zoomed, ease: 'inOut' },
      { t: 2000, pose: zoomed, ease: 'inOut' },
    ];
    expect(sampleCamera(doubled, 1000, frame)).toEqual(zoomed);
    expect(sampleCamera(doubled, 500, frame)).toEqual(rest);
  });

  it('clamps even when a keyframe asks for a view outside the frame', () => {
    const wild: CameraKeyframe[] = [
      { t: 0, pose: { scale: 3, cx: -500, cy: -500 }, ease: 'linear' },
      { t: 100, pose: { scale: 3, cx: 9000, cy: 9000 }, ease: 'linear' },
    ];
    const view = viewRect(sampleCamera(wild, 50, frame), frame);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x + view.width).toBeLessThanOrEqual(frame.width + 1e-9);
    expect(view.y + view.height).toBeLessThanOrEqual(frame.height + 1e-9);
  });
});
