import { Readable } from 'node:stream';
import { computeLayout, createRenderModel, smoothnessToEaseMs } from '@scrim/core/render';
import { describe, expect, it } from 'vitest';
import { buildAudioGraph } from '../../src/main/export/audio-graph';
import { createBubbleTrack } from '../../src/main/export/bubble';
import { Compositor } from '../../src/main/export/compositor';
import { bitrateFor, encoderArgs, saferPreset } from '../../src/main/export/encoders';
import { screenFilter, uniqueOutputPath } from '../../src/main/export/exporter';
import { FrameCursor, FrameReader } from '../../src/main/export/frames';
import { cursorPaintFor, micGainFor } from '../../src/main/export/look';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { buildBase } from '../../src/main/export/raster';
import { rebaseSession } from '../../src/main/export/source';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { makeSession } from './support/export-session';

describe('audio graph', () => {
  it('joins the kept stretches of the microphone and fills gaps with silence', () => {
    const graph = buildAudioGraph(
      [
        { outStartMs: 0, durationMs: 20, micStartMs: null },
        { outStartMs: 20, durationMs: 1000, micStartMs: 0 },
        { outStartMs: 1020, durationMs: 500, micStartMs: 2000 },
      ],
      { micInput: 1, gain: 1.8 },
    );
    expect(graph?.label).toBe('aout');
    const text = graph?.filter ?? '';
    expect(text).toContain('asplit=2');
    expect(text).toContain('atrim=start=2.000000:end=2.500000');
    expect(text).toContain('anullsrc');
    expect(text).toContain('concat=n=3:v=0:a=1');
    expect(text).toContain('volume=1.800');
  });

  it('builds nothing when there is no sound to make', () => {
    expect(buildAudioGraph([], { micInput: 1, gain: 1 })).toBeNull();
  });

  it('does not split the input when only one stretch is kept', () => {
    const graph = buildAudioGraph([{ outStartMs: 0, durationMs: 800, micStartMs: 100 }], {
      micInput: 1,
      gain: 1,
    });
    expect(graph?.filter).not.toContain('asplit');
  });
});

describe('encoders', () => {
  it('scales the bitrate with size, frame rate and quality within limits', () => {
    const base = { width: 1920, height: 1080, fps: 30 };
    expect(bitrateFor({ ...base, quality: 'low' })).toBeLessThan(
      bitrateFor({ ...base, quality: 'high' }),
    );
    expect(bitrateFor({ width: 160, height: 90, fps: 5, quality: 'low' })).toBe(1_500_000);
    expect(bitrateFor({ width: 3840, height: 2160, fps: 60, quality: 'high' })).toBe(60_000_000);
  });

  it('never asks for the GPL encoder', () => {
    for (const name of ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_mf', 'libopenh264'] as const) {
      expect(encoderArgs(name, { bitrate: 5_000_000, fps: 30 })).toContain(name);
    }
    expect(encoderArgs('h264_mf', { bitrate: 5_000_000, fps: 30 }).join(' ')).not.toContain(
      'libx264',
    );
  });

  it('steps down one size for the safer retry', () => {
    expect(saferPreset('2160p')).toBe('1440p');
    expect(saferPreset('1080p')).toBe('720p');
    expect(saferPreset('720p')).toBe('720p');
  });
});

describe('frames', () => {
  it('cuts a stream into whole pictures however the chunks fall', async () => {
    const bytes = Buffer.from(Array.from({ length: 24 }, (_, i) => i));
    const chunks = [
      bytes.subarray(0, 5),
      bytes.subarray(5, 6),
      bytes.subarray(6, 17),
      bytes.subarray(17),
    ];
    const reader = new FrameReader(Readable.from(chunks), 8);
    const frames: number[][] = [];
    for (let frame = await reader.next(); frame !== null; frame = await reader.next()) {
      frames.push([...frame]);
    }
    expect(frames).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14, 15],
      [16, 17, 18, 19, 20, 21, 22, 23],
    ]);
  });

  it('drops a partial last picture and holds the last whole one', async () => {
    const reader = new FrameReader(Readable.from([Buffer.alloc(20, 7)]), 8);
    const cursor = new FrameCursor(reader);
    expect((await cursor.at(0))?.length).toBe(8);
    expect(await cursor.at(1)).not.toBeNull();
    expect(await cursor.at(50)).not.toBeNull();
    expect(cursor.empty).toBe(false);
  });
});

describe('output names', () => {
  it('numbers a name that is taken', async () => {
    const taken = new Set(['out/Scrim.mp4', 'out/Scrim 2.mp4']);
    const path = await uniqueOutputPath('out', 'Scrim', (candidate) =>
      Promise.resolve(taken.has(candidate.replaceAll('\\', '/'))),
    );
    expect(path.replaceAll('\\', '/')).toBe('out/Scrim 3.mp4');
  });
});

describe('screen filter', () => {
  it('crops a region in video pixels and scales only when sizes differ', () => {
    const session = makeSession({
      cropPx: { x: 100, y: 50, width: 800, height: 600 },
      frame: { width: 1920, height: 1080 },
    });
    expect(
      screenFilter({ session }, { width: 800, height: 600 }, { width: 1920, height: 1080 }, 30),
    ).toBe('fps=30:start_time=0,crop=800:600:100:50,format=bgr0');
    expect(
      screenFilter({ session }, { width: 400, height: 300 }, { width: 1920, height: 1080 }, 60),
    ).toContain('scale=400:300');
  });
});

describe('rebaseSession', () => {
  it('counts every time from the first screen frame, like the mouse log does', () => {
    const session = makeSession({
      screenStartMs: 2500,
      pauses: [{ pausedAt: 4000, resumedAt: 5000 }],
    });
    const moved = rebaseSession(session);
    expect(moved.tracks[0]?.startedAt).toBe(0);
    expect(moved.tracks[1]?.startedAt).toBe(40);
    expect(moved.pauses).toEqual([{ pausedAt: 1500, resumedAt: 2500 }]);
    expect(moved.heartbeatElapsedMs).toBe(4000);
    // The original object was not changed.
    expect(session.tracks[0]?.startedAt).toBe(2500);
  });
});

describe('bubble track', () => {
  const source = { width: 1280, height: 720 };
  const layout = computeLayout(source, { width: 1280, height: 720 }, { spec: { kind: 'none' } });

  it('maps desktop positions to the picture and glides to a new corner', () => {
    const session = makeSession({ withBubble: true });
    const track = createBubbleTrack({
      session,
      source,
      layout,
      staticBubble: null,
      shape: 'circle',
    });
    // No static bubble means the camera is hidden.
    expect(track).toBeNull();
    const shown = createBubbleTrack({
      session,
      source,
      layout,
      staticBubble: { rect: { x: 0, y: 0, width: 100, height: 100 }, shape: 'circle', radius: 50 },
      shape: 'circle',
    });
    expect(shown).not.toBeNull();
    const first = shown?.at(100);
    // 16 desktop pixels at a scale of 1.5.
    expect(first?.x).toBeCloseTo(24);
    expect(first?.side).toBeCloseTo(180);
    expect(first?.radius).toBeCloseTo(90);
    const during = shown?.at(2100);
    const after = shown?.at(2500);
    expect(after?.y).toBeCloseTo(24);
    expect(during?.y).toBeGreaterThan(after?.y ?? 0);
    expect(during?.y).toBeLessThan(first?.y ?? 0);
    expect(shown?.maxSide).toBeCloseTo(180);
  });

  it('uses the chosen corner when no positions were saved', () => {
    const track = createBubbleTrack({
      session: makeSession({}),
      source,
      layout,
      staticBubble: {
        rect: { x: 900, y: 500, width: 200, height: 200 },
        shape: 'rounded-square',
        radius: 44,
      },
      shape: 'rounded-square',
    });
    expect(track?.at(0)).toEqual({ x: 900, y: 500, side: 200, radius: 44 });
  });
});

describe('settings to look', () => {
  it('maps every setting that changes the picture', () => {
    const style = renderStyleFromSettings({
      ...DEFAULT_SETTINGS,
      backgroundId: 'none',
      zoomLevel: 2.4,
      smoothness: 0,
    });
    expect(style.background).toEqual({ spec: { kind: 'none' } });
    expect(style.zoom?.maxZoom).toBe(2.4);
    expect(style.zoom?.easeMs).toBe(smoothnessToEaseMs(0));
    expect(micGainFor('quieter')).toBeLessThan(micGainFor('louder'));
    expect(cursorPaintFor('white').haloRing[0]).toBe(255);
  });
});

describe('compositor', () => {
  const source = { width: 64, height: 36 };
  const paint = cursorPaintFor('brand');
  const solid = (
    b: number,
    g: number,
    r: number,
    size = source.width * source.height,
  ): Uint8Array => {
    const data = new Uint8Array(size * 4);
    for (let i = 0; i < size; i += 1) data.set([b, g, r, 255], i * 4);
    return data;
  };
  const pixel = (frame: Uint8Array, width: number, x: number, y: number): number[] => [
    ...frame.subarray((y * width + x) * 4, (y * width + x) * 4 + 3),
  ];

  it('copies the picture untouched when nothing is zoomed or padded', () => {
    const layout = computeLayout(source, source, { spec: { kind: 'none' } });
    const screen = solid(10, 20, 30);
    const out = new Uint8Array(screen.length);
    new Compositor(layout, source, buildBase(layout), paint).render(
      {
        screen,
        camera: null,
        cameraSize: 0,
        view: { x: 0, y: 0, width: 64, height: 36 },
        cursor: { halo: null, ripples: [] },
        bubble: null,
      },
      out,
    );
    expect(pixel(out, 64, 5, 5)).toEqual([10, 20, 30]);
    expect(pixel(out, 64, 63, 35)).toEqual([10, 20, 30]);
  });

  it('shows only the zoomed part, scaled up', () => {
    const layout = computeLayout(source, source, { spec: { kind: 'none' } });
    // Left half red, right half blue.
    const screen = new Uint8Array(source.width * source.height * 4);
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        screen.set(x < 32 ? [0, 0, 255, 255] : [255, 0, 0, 255], (y * source.width + x) * 4);
      }
    }
    const out = new Uint8Array(screen.length);
    new Compositor(layout, source, buildBase(layout), paint).render(
      {
        screen,
        camera: null,
        cameraSize: 0,
        view: { x: 32, y: 0, width: 32, height: 18 },
        cursor: { halo: null, ripples: [] },
        bubble: null,
      },
      out,
    );
    expect(pixel(out, 64, 2, 2)).toEqual([255, 0, 0]);
    expect(pixel(out, 64, 60, 30)).toEqual([255, 0, 0]);
  });

  it('puts the recording on the background with rounded corners and a halo only inside it', () => {
    const output = { width: 200, height: 120 };
    const layout = computeLayout(source, output, {
      spec: { kind: 'preset', id: 'butter' },
      paddingShare: 0.1,
      radiusShare: 0.2,
    });
    const base = buildBase(layout);
    const out = new Uint8Array(output.width * output.height * 4);
    new Compositor(layout, source, base, paint).render(
      {
        screen: solid(0, 0, 255),
        camera: null,
        cameraSize: 0,
        view: { x: 0, y: 0, width: 64, height: 36 },
        cursor: { halo: { x: 32, y: 18, radius: 6 }, ripples: [] },
        bubble: null,
      },
      out,
    );
    // Butter background in the corner of the frame, the recording's red in the middle, and the
    // corner of the recording rounded away so the background still shows there.
    expect(pixel(out, 200, 0, 0)).toEqual([...pixel(base, 200, 0, 0)]);
    const content = layout.content;
    const topLeft = pixel(out, 200, Math.round(content.x), Math.round(content.y));
    expect(topLeft).toEqual([...pixel(base, 200, Math.round(content.x), Math.round(content.y))]);
    const inside = pixel(out, 200, Math.round(content.x + 6), Math.round(content.y + 6));
    expect(inside[2]).toBeGreaterThan(200);
    expect(inside[0]).toBeLessThan(60);
  });

  it('draws the camera bubble where it is told, as a circle', () => {
    const layout = computeLayout(source, source, { spec: { kind: 'none' } });
    const out = new Uint8Array(source.width * source.height * 4);
    new Compositor(layout, source, buildBase(layout), paint).render(
      {
        screen: solid(0, 0, 0),
        camera: solid(0, 200, 0, 16 * 16),
        cameraSize: 16,
        view: { x: 0, y: 0, width: 64, height: 36 },
        cursor: { halo: null, ripples: [] },
        bubble: { x: 40, y: 10, side: 20, radius: 10 },
      },
      out,
    );
    expect(pixel(out, 64, 50, 20)[1]).toBeGreaterThan(150);
    // The square's corner is outside the circle, so it stays the screen colour.
    expect(pixel(out, 64, 40, 10)).toEqual([0, 0, 0]);
  });
});

describe('render model with a late screen start', () => {
  it('keeps the first frame of the recording at time zero', () => {
    const session = rebaseSession(makeSession({ screenStartMs: 2500 }));
    const model = createRenderModel({
      session,
      log: null,
      edits: { trim: null, cuts: [] },
      settings: { preset: 'source' },
    });
    expect(model.describeAt(0).screenTimeMs).toBe(0);
    expect(model.totalMs).toBeGreaterThan(3500);
    expect(model.totalMs).toBeLessThan(4100);
  });
});
