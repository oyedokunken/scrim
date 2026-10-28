import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { outputSize } from '../src/export/size';
import {
  buildTimeline,
  computeBubble,
  computeLayout,
  createRenderModel,
  cursorStateAt,
  frameCount,
  frameTime,
  outputToSource,
  pickFrame,
  planAudio,
  prepareCursor,
  recordingDuration,
  smoothnessToEaseMs,
  sourceToOutput,
  type RenderInput,
} from '../src/render';
import type { InputEvent } from '../src/input/types';
import type { SessionFile } from '../src/session/schema';

const FRAME = { width: 1920, height: 1080 };

function session(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    version: 1,
    id: '6f1f3c1e-0000-4000-8000-000000000001',
    name: 'test',
    createdAt: '2026-10-27T10:00:00.000Z',
    app: { version: '0.0.0', os: 'windows', arch: 'x64' },
    pid: 1,
    source: {
      kind: 'display',
      origin: { x: 0, y: 0 },
      scaleFactor: 1,
      frame: FRAME,
    },
    capture: { cursorInCapture: true },
    tracks: [
      {
        kind: 'screen',
        file: 'screen.raw.webm',
        mimeType: 'video/webm',
        startedAt: 90,
        bytesWritten: 1,
        complete: true,
        stoppedAt: 10_000,
      },
      {
        kind: 'camera',
        file: 'camera.raw.webm',
        mimeType: 'video/webm',
        startedAt: 200,
        bytesWritten: 1,
        complete: true,
        stoppedAt: 10_000,
      },
      {
        kind: 'mic',
        file: 'mic.raw.webm',
        mimeType: 'audio/webm',
        startedAt: 100,
        bytesWritten: 1,
        complete: true,
        stoppedAt: 9_000,
      },
    ],
    clock: { rendererOffsetMs: 0, uncertaintyMs: 1 },
    pauses: [],
    input: { status: 'recorded', file: 'x.scrim.json' },
    warnings: [],
    heartbeatAt: '2026-10-27T10:00:10.000Z',
    heartbeatElapsedMs: 10_000,
    cleanClose: true,
    ...overrides,
  };
}

const clicks: InputEvent[] = [
  { type: 'move', t: 0, x: 100, y: 100 },
  { type: 'click', t: 2000, x: 960, y: 540, button: 'left' },
  { type: 'move', t: 3000, x: 1000, y: 560 },
  { type: 'click', t: 6000, x: 400, y: 300, button: 'left' },
  { type: 'move', t: 9000, x: 500, y: 400 },
];

function input(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    session: session(),
    log: { frame: FRAME, events: clicks },
    edits: { trim: null, cuts: [] },
    settings: { preset: '1080p', fps: 30 },
    ...overrides,
  };
}

describe('outputSize', () => {
  it('never upscales and keeps sides even', () => {
    expect(outputSize({ width: 1280, height: 720 }, '1080p')).toEqual({ width: 1280, height: 720 });
    expect(outputSize({ width: 1921, height: 1081 }, 'source')).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('caps at 3840 by 2160 and fits tall frames', () => {
    expect(outputSize({ width: 7680, height: 4320 }, 'source')).toEqual({
      width: 3840,
      height: 2160,
    });
    expect(outputSize({ width: 800, height: 1600 }, '720p')).toEqual({ width: 360, height: 720 });
    expect(outputSize({ width: 3840, height: 2160 }, '1080p')).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('is even, bounded and never enlarges, for any frame and preset', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 9000 }),
        fc.integer({ min: 2, max: 9000 }),
        fc.constantFrom('source', '720p', '1080p', '1440p', '2160p' as const),
        (width, height, preset) => {
          const size = outputSize({ width, height }, preset);
          expect(size.width % 2).toBe(0);
          expect(size.height % 2).toBe(0);
          expect(size.width).toBeLessThanOrEqual(3840);
          expect(size.height).toBeLessThanOrEqual(2160);
          expect(size.width).toBeLessThanOrEqual(Math.max(width, 2));
          expect(size.height).toBeLessThanOrEqual(Math.max(height, 2));
        },
      ),
    );
  });
});

describe('timeline', () => {
  it('is the whole recording with no edits', () => {
    const timeline = buildTimeline(10_000, { trim: null, cuts: [] });
    expect(timeline.totalMs).toBe(10_000);
    expect(outputToSource(timeline, 4000)).toBe(4000);
  });

  it('applies the trim and the cuts', () => {
    const timeline = buildTimeline(10_000, {
      trim: { startMs: 1000, endMs: 9000 },
      cuts: [
        { startMs: 3000, endMs: 4000 },
        { startMs: 6000, endMs: 7000 },
      ],
    });
    expect(timeline.totalMs).toBe(6000);
    expect(outputToSource(timeline, 0)).toBe(1000);
    expect(outputToSource(timeline, 2000)).toBe(4000);
    expect(outputToSource(timeline, 3999)).toBe(5999);
    expect(outputToSource(timeline, 4000)).toBe(7000);
    expect(sourceToOutput(timeline, 3500)).toBeNull();
    expect(sourceToOutput(timeline, 500)).toBeNull();
    expect(sourceToOutput(timeline, 5000)).toBe(3000);
  });

  it('survives unsorted, overlapping and out of range cuts', () => {
    const timeline = buildTimeline(1000, {
      trim: null,
      cuts: [
        { startMs: 600, endMs: 900 },
        { startMs: 100, endMs: 700 },
        { startMs: 950, endMs: 5000 },
      ],
    });
    expect(timeline.totalMs).toBe(150);
  });

  it('handles everything cut and an empty recording', () => {
    const none = buildTimeline(1000, { trim: null, cuts: [{ startMs: 0, endMs: 1000 }] });
    expect(none.totalMs).toBe(0);
    expect(outputToSource(none, 50)).toBe(0);
    expect(frameCount(0, 30)).toBe(0);
    expect(buildTimeline(1000, { trim: { startMs: 5000, endMs: 9000 }, cuts: [] }).totalMs).toBe(0);
  });

  it('is monotonic, never shows a cut and keeps the length', () => {
    const spanArb = fc
      .tuple(fc.integer({ min: 0, max: 20_000 }), fc.integer({ min: 1, max: 5000 }))
      .map(([s, l]) => ({ startMs: s, endMs: s + l }));
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20_000 }),
        fc.array(spanArb, { maxLength: 6 }),
        fc.option(spanArb, { nil: null }),
        (duration, cuts, trim) => {
          const timeline = buildTimeline(duration, { trim, cuts });
          let previous = -1;
          for (let out = 0; out <= timeline.totalMs; out += 37) {
            const src = outputToSource(timeline, out);
            expect(src).toBeGreaterThanOrEqual(previous);
            previous = src;
            if (out < timeline.totalMs) {
              for (const cut of cuts) {
                const inside = src >= cut.startMs && src < cut.endMs;
                const trimmedStart = Math.max(trim?.startMs ?? 0, 0);
                // A cut only hides time inside the kept range.
                if (src >= trimmedStart) expect(inside).toBe(false);
              }
              expect(src).toBeLessThan(duration + 1);
            }
          }
          const kept = timeline.segments.reduce((sum, s) => sum + (s.outEnd - s.outStart), 0);
          expect(kept).toBe(timeline.totalMs);
          const end = Math.min(trim?.endMs ?? duration, duration);
          const start = Math.min(trim?.startMs ?? 0, end);
          const cutLength = new Set<number>();
          for (let t = start; t < end; t += 1) {
            if (cuts.some((c) => t >= c.startMs && t < c.endMs)) cutLength.add(t);
          }
          expect(timeline.totalMs).toBe(end - start - cutLength.size);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('frame schedule', () => {
  it('counts frames so every frame time is inside the video', () => {
    expect(frameCount(1000, 30)).toBe(30);
    expect(frameCount(1001, 30)).toBe(31);
    expect(frameTime(30, 30)).toBe(1000);
    expect(frameTime(29, 30)).toBeLessThan(1000);
  });

  it('holds the last frame and shows the first before it starts', () => {
    const pts = [100, 1100, 2100];
    expect(pickFrame(pts, 0)).toBe(0);
    expect(pickFrame(pts, 1099)).toBe(0);
    expect(pickFrame(pts, 1100)).toBe(1);
    expect(pickFrame(pts, 99_000)).toBe(2);
    expect(pickFrame([], 5)).toBe(-1);
  });
});

describe('recordingDuration', () => {
  it('removes paused time and ignores the container', () => {
    const s = session({ pauses: [{ pausedAt: 2000, resumedAt: 3000 }] });
    expect(recordingDuration(s)).toBe(9000);
  });

  it('falls back to the heartbeat after a crash', () => {
    const base = session();
    const crashed = session({
      tracks: base.tracks.map((track) => ({ ...track, stoppedAt: undefined })),
      heartbeatElapsedMs: 4000,
    });
    expect(recordingDuration(crashed)).toBe(4000);
    expect(recordingDuration(session({ tracks: [], heartbeatElapsedMs: 700 }))).toBe(700);
  });
});

describe('render model', () => {
  it('describes frames with auto zoom around a click', () => {
    const model = createRenderModel(input());
    expect(model.totalMs).toBe(10_000);
    expect(model.frameCount).toBe(300);
    const rest = model.describeAt(500);
    expect(rest.pose.scale).toBe(1);
    const zoomed = model.describeAt(2800);
    expect(zoomed.pose.scale).toBeGreaterThan(1.7);
    expect(zoomed.view.width).toBeLessThan(FRAME.width);
  });

  it('offsets the screen and camera tracks and hides the camera before it starts', () => {
    const model = createRenderModel(input());
    const early = model.describeAt(150);
    expect(early.screenTimeMs).toBe(60);
    expect(early.cameraTimeMs).toBeNull();
    const later = model.describeAt(1000);
    expect(later.screenTimeMs).toBe(910);
    expect(later.cameraTimeMs).toBe(800);
    expect(model.describeFrame(30).outputTimeMs).toBe(1000);
  });

  it('keeps media aligned across a pause', () => {
    const s = session({
      pauses: [{ pausedAt: 1000, resumedAt: 4000 }],
      tracks: session().tracks.map((t) => ({ ...t, startedAt: t.startedAt })),
    });
    const model = createRenderModel(input({ session: s }));
    expect(model.totalMs).toBe(7000);
    expect(model.describeAt(2000).cameraTimeMs).toBe(1800);
  });

  it('applies cuts to the zoom and the schedule', () => {
    const model = createRenderModel(
      input({ edits: { trim: null, cuts: [{ startMs: 1000, endMs: 2000 }] } }),
    );
    expect(model.totalMs).toBe(9000);
    expect(model.describeAt(1000).recordingTimeMs).toBe(2000);
  });

  it('turns zoom off and keeps the full crop', () => {
    const model = createRenderModel(
      input({ settings: { preset: '1080p', style: { zoom: { enabled: false } } } }),
    );
    expect(model.keyframes).toEqual([]);
    expect(model.describeAt(2800).view).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('turns effects off when input is unavailable', () => {
    const s = session({ input: { status: 'unavailable', reason: 'window-bounds-unsupported' } });
    const model = createRenderModel(input({ session: s }));
    expect(model.effectsOffReason).toContain('window-bounds-unsupported');
    expect(model.keyframes).toEqual([]);
    const frame = model.describeAt(2100);
    expect(frame.cursor.halo).toBeNull();
    expect(frame.cursor.ripples).toEqual([]);
    expect(createRenderModel(input({ log: null })).effectsOffReason).toContain('no input log');
  });

  it('lists the zoom moments, and an edited list replaces the planned one', () => {
    const planned = createRenderModel(input());
    expect(planned.zoomMoments.length).toBeGreaterThan(0);
    const edited = createRenderModel(
      input({
        edits: {
          trim: null,
          cuts: [],
          zoom: { moments: [{ startMs: 6000, endMs: 8000, x: 100, y: 100 }] },
        },
      }),
    );
    expect(edited.zoomMoments).toEqual([{ startMs: 6000, endMs: 8000, x: 100, y: 100 }]);
    expect(edited.describeAt(2800).pose.scale).toBe(1);
    expect(edited.describeAt(7500).pose.scale).toBeGreaterThan(1.7);
    const none = createRenderModel(
      input({ edits: { trim: null, cuts: [], zoom: { moments: [] } } }),
    );
    expect(none.keyframes).toEqual([]);
  });

  it('clamps the zoom level to the supported range', () => {
    const model = createRenderModel(
      input({ settings: { preset: '1080p', style: { zoom: { maxZoom: 9 } } } }),
    );
    expect(model.describeAt(2800).pose.scale).toBeLessThanOrEqual(3);
  });

  it('plans audio after cuts using the mic offset', () => {
    const model = createRenderModel(
      input({ edits: { trim: null, cuts: [{ startMs: 1000, endMs: 2000 }] } }),
    );
    expect(model.audio[0]).toEqual({ outStartMs: 0, durationMs: 100, micStartMs: null });
    const total = model.audio.reduce((sum, piece) => sum + piece.durationMs, 0);
    expect(total).toBe(model.totalMs);
    expect(
      createRenderModel(input({ settings: { preset: '1080p', keepAudio: false } })).audio,
    ).toEqual([]);
  });

  it('uses the crop size when recording a region', () => {
    const s = session({
      source: {
        kind: 'region',
        origin: { x: 0, y: 0 },
        scaleFactor: 1,
        cropPx: { x: 10, y: 10, width: 801, height: 601 },
      },
    });
    const model = createRenderModel(input({ session: s, log: null }));
    expect(model.source).toEqual({ width: 801, height: 601 });
    expect(model.layout.output.width % 2).toBe(0);
  });

  it('falls back to the log frame, a default and the default fps', () => {
    const s = session({ source: { kind: 'display', origin: { x: 0, y: 0 }, scaleFactor: 1 } });
    expect(createRenderModel(input({ session: s })).source).toEqual(FRAME);
    expect(createRenderModel(input({ session: s, log: null })).source).toEqual(FRAME);
    expect(createRenderModel(input({ settings: { preset: 'source', fps: 0 } })).fps).toBe(30);
  });
});

describe('cursor', () => {
  const track = prepareCursor(clicks, FRAME);

  it('follows the cursor and draws ripples that fade', () => {
    const state = cursorStateAt(track, 2300, 'halo-ripples');
    expect(state.halo?.radius).toBeGreaterThan(0);
    expect(state.ripples).toHaveLength(1);
    const ripple = state.ripples[0];
    expect(ripple?.alpha).toBeCloseTo(1 - 300 / 600);
    expect(cursorStateAt(track, 2700, 'halo-ripples').ripples).toEqual([]);
    expect(cursorStateAt(track, 1999, 'halo-ripples').ripples).toEqual([]);
  });

  it('respects each style', () => {
    expect(cursorStateAt(track, 2100, 'halo').ripples).toEqual([]);
    expect(cursorStateAt(track, 2100, 'halo').halo).not.toBeNull();
    expect(cursorStateAt(track, 2100, 'ripples').halo).toBeNull();
    expect(cursorStateAt(track, 2100, 'ripples').ripples).toHaveLength(1);
    expect(cursorStateAt(track, 2100, 'off')).toEqual({ halo: null, ripples: [] });
    expect(cursorStateAt(prepareCursor([], FRAME), 0, 'halo').halo).toBeNull();
  });

  it('hides the halo when the cursor is outside the recorded area', () => {
    const away = prepareCursor([{ type: 'move', t: 0, x: 5000, y: 5000 }], FRAME);
    expect(cursorStateAt(away, 10, 'halo').halo).toBeNull();
  });
});

describe('layout', () => {
  const out = { width: 1920, height: 1080 };

  it('fills the output with no background', () => {
    const layout = computeLayout(FRAME, out, { spec: { kind: 'none' } });
    expect(layout.content).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(layout.radius).toBe(0);
    expect(layout.shadow).toBeNull();
  });

  it('insets, centers and rounds with a background', () => {
    const layout = computeLayout(FRAME, out, { spec: { kind: 'preset', id: 'dots' } });
    const { content } = layout;
    expect(content.x).toBeGreaterThan(0);
    expect(content.x + content.width / 2).toBeCloseTo(960);
    expect(content.y + content.height / 2).toBeCloseTo(540);
    expect(content.width / content.height).toBeCloseTo(16 / 9);
    expect(layout.radius).toBeGreaterThan(0);
    expect(layout.shadow?.blur).toBeGreaterThan(0);
    expect(layout.background.kind).toBe('fill');
  });

  it('caps padding, accepts custom fills and images, and falls back for unknown ids', () => {
    const wide = computeLayout(FRAME, out, {
      spec: { kind: 'preset', id: 'butter' },
      paddingShare: 5,
    });
    expect(wide.content.x).toBeCloseTo(
      1080 * 0.25 + (1920 - 2 * 1080 * 0.25 - wide.content.width) / 2,
    );
    expect(
      computeLayout(FRAME, out, { spec: { kind: 'preset', id: 'missing' } }).background.kind,
    ).toBe('fill');
    expect(
      computeLayout(FRAME, out, { spec: { kind: 'image', path: 'a.png' } }).background,
    ).toEqual({
      kind: 'image',
      path: 'a.png',
    });
    const fill = { kind: 'solid', color: '#000000' } as const;
    expect(computeLayout(FRAME, out, { spec: { kind: 'fill', fill }, radiusShare: 0 }).radius).toBe(
      0,
    );
  });

  it('places the bubble in each corner inside the content', () => {
    const content = { x: 100, y: 50, width: 1600, height: 900 };
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const bubble = computeBubble(content, { corner, size: 'L', shape: 'rounded-square' });
      expect(bubble).not.toBeNull();
      const r = bubble?.rect;
      expect(r?.x).toBeGreaterThanOrEqual(content.x);
      expect(r?.y).toBeGreaterThanOrEqual(content.y);
      expect((r?.x ?? 0) + (r?.width ?? 0)).toBeLessThanOrEqual(content.x + content.width);
      expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual(content.y + content.height);
    }
    const circle = computeBubble(content, {});
    expect(circle?.radius).toBeCloseTo((circle?.rect.width ?? 0) / 2);
    expect(computeBubble(content, { visible: false })).toBeNull();
  });
});

describe('audio plan', () => {
  it('pads silence before the mic starts and after it stops', () => {
    const timeline = buildTimeline(1000, { trim: null, cuts: [] });
    const pieces = planAudio(timeline, 100, 600);
    expect(pieces).toEqual([
      { outStartMs: 0, durationMs: 100, micStartMs: null },
      { outStartMs: 100, durationMs: 600, micStartMs: 0 },
      { outStartMs: 700, durationMs: 300, micStartMs: null },
    ]);
  });

  it('is silence when the mic never overlaps and covers the output always', () => {
    const timeline = buildTimeline(500, { trim: null, cuts: [] });
    expect(planAudio(timeline, 900, 100)).toEqual([
      { outStartMs: 0, durationMs: 500, micStartMs: null },
    ]);
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 3000 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.array(
          fc
            .tuple(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 1, max: 800 }))
            .map(([s, l]) => ({ startMs: s, endMs: s + l })),
          { maxLength: 4 },
        ),
        (offset, length, cuts) => {
          const tl = buildTimeline(3000, { trim: null, cuts });
          const pieces = planAudio(tl, offset, length);
          const total = pieces.reduce((sum, p) => sum + p.durationMs, 0);
          expect(total).toBeCloseTo(tl.totalMs, 6);
          for (const piece of pieces) {
            if (piece.micStartMs !== null) {
              expect(piece.micStartMs).toBeGreaterThanOrEqual(0);
              expect(piece.micStartMs + piece.durationMs).toBeLessThanOrEqual(length + 1e-6);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('smoothness', () => {
  it('maps 0 to 1 onto the ease range', () => {
    expect(smoothnessToEaseMs(0)).toBe(150);
    expect(smoothnessToEaseMs(1)).toBe(700);
    expect(smoothnessToEaseMs(-3)).toBe(150);
    expect(smoothnessToEaseMs(7)).toBe(700);
  });
});
