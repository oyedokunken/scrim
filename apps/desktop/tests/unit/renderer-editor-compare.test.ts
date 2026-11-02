import { describe, expect, it } from 'vitest';
import { createRenderModel } from '@scrim/core/render';
import type { SessionFile } from '@scrim/core';
import {
  SPLIT_MAX,
  SPLIT_MIN,
  paintFrame,
  splitFromPointer,
  type CompareMode,
  type FrameMedia,
} from '../../src/renderer/src/editor/draw-frame';
import { cursorPaintCss } from '../../src/shared/render-style';

const session: SessionFile = {
  version: 1,
  id: '6e8f53a5-1efc-44e5-aaa1-624bd921d469',
  name: 'Test',
  createdAt: '2026-10-28T16:26:43.683Z',
  app: { version: '1.0.0', os: 'windows', arch: 'x64' },
  pid: 1,
  source: {
    kind: 'display',
    displayId: '1',
    origin: { x: 0, y: 0 },
    scaleFactor: 1,
    frame: { width: 1280, height: 720 },
  },
  capture: { cursorInCapture: true },
  tracks: [
    {
      kind: 'screen',
      file: 'screen.raw.webm',
      mimeType: 'video/webm;codecs=h264',
      startedAt: 0,
      bytesWritten: 1,
      complete: true,
      stoppedAt: 8000,
      playableFile: 'screen.mp4',
    },
  ],
  clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
  pauses: [],
  input: { status: 'recorded', file: 'input.ndjson' },
  warnings: [],
  heartbeatAt: '2026-10-28T16:27:16.620Z',
  heartbeatElapsedMs: 8000,
  cleanClose: true,
};

const log = {
  version: 1 as const,
  frame: { width: 1280, height: 720 },
  events: [
    { type: 'move' as const, t: 0, x: 640, y: 360 },
    { type: 'click' as const, t: 2000, x: 640, y: 360, button: 'left' as const },
  ],
};

const model = createRenderModel({
  session,
  log,
  edits: { trim: null, cuts: [] },
  settings: { preset: 'source', fps: 30, keepAudio: true },
});
const paint = cursorPaintCss('brand');

/** A drawing context that records what was asked of it, and nothing else. */
function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, name: string) {
      if (name === 'calls') return calls;
      if (name === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => {
        calls.push({ name, args });
      };
    },
    set() {
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const screen = { videoWidth: 1280, videoHeight: 720 } as unknown as FrameMedia['screen'];
const media: FrameMedia = { screen, camera: null };

function paintMode(mode: CompareMode, split = 0.5) {
  const { ctx, calls } = fakeContext();
  paintFrame(ctx, mode, split, model, model.describeAt(2500), media, paint);
  return calls;
}

describe('before, compare and after', () => {
  it('before draws the whole recording on the background with no zoom, halo or ripples', () => {
    const calls = paintMode('before');
    const images = calls.filter((c) => c.name === 'drawImage');
    expect(images).toHaveLength(1);
    // The crop is the full frame even where the finished frame is zoomed in.
    expect(images[0]?.args.slice(1, 5)).toEqual([0, 0, 1280, 720]);
    expect(calls.some((c) => c.name === 'arc')).toBe(false);
  });

  it('before keeps the cursor as a plain pointer when the capture hides it', () => {
    const hidden = createRenderModel({
      session: { ...session, capture: { cursorInCapture: false } },
      log,
      edits: { trim: null, cuts: [] },
      settings: { preset: 'source', fps: 30, keepAudio: true },
    });
    const { ctx, calls } = fakeContext();
    paintFrame(ctx, 'before', 0.5, hidden, hidden.describeAt(2500), media, paint);
    expect(calls.some((c) => c.name === 'lineTo')).toBe(true);
    expect(calls.some((c) => c.name === 'arc')).toBe(false);
  });

  it('after draws the finished frame with the zoom and the halo, and never the raw capture alone', () => {
    const calls = paintMode('after');
    const images = calls.filter((c) => c.name === 'drawImage');
    expect(images).toHaveLength(1);
    expect(images[0]?.args).toHaveLength(9);
    expect(calls.some((c) => c.name === 'arc')).toBe(true);
  });

  it('compare draws both, with the raw capture clipped to the left of the divider', () => {
    const calls = paintMode('compare', 0.3);
    const images = calls.filter((c) => c.name === 'drawImage');
    expect(images.map((c) => c.args.length)).toEqual([9, 9]);
    // The left half is the plain picture: the whole frame, no zoom.
    expect(images[1]?.args.slice(1, 5)).toEqual([0, 0, 1280, 720]);
    expect(images[0]?.args.slice(1, 5)).not.toEqual([0, 0, 1280, 720]);
    const rect = calls.filter((c) => c.name === 'rect').at(-1);
    expect(rect?.args).toEqual([0, 0, model.layout.output.width * 0.3, model.layout.output.height]);
    expect(calls.at(-1)?.name).toBe('restore');
  });

  it('compare and after use the same moment, so the result and the original stay in step', () => {
    const frame = model.describeAt(2500);
    expect(frame.recordingTimeMs).toBe(2500);
    expect(frame.screenTimeMs).toBe(2500);
    expect(frame.pose.scale).toBeGreaterThan(1);
  });
});

describe('the divider', () => {
  it('follows the pointer and stays inside the stage', () => {
    expect(splitFromPointer(300, 100, 400)).toBe(0.5);
    expect(splitFromPointer(-50, 100, 400)).toBe(SPLIT_MIN);
    expect(splitFromPointer(9000, 100, 400)).toBe(SPLIT_MAX);
    expect(splitFromPointer(10, 0, 0)).toBe(0.5);
  });
});
