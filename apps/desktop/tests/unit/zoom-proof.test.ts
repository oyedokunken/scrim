import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor, styleFromSettings } from '../../src/main/export/look';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { makeFixture, testFfmpeg } from './support/export-fixture';
import type { Fixture } from './support/export-fixture';

const tools = testFfmpeg();
const made: Fixture[] = [];
afterAll(() => {
  for (const fixture of made) rmSync(fixture.root, { recursive: true, force: true });
});

const WIDTH = 1280;
const HEIGHT = 720;
const GRID = 80;

/**
 * The clicks of the scripted session. The first two are close together, so the camera must stay in
 * for both. The third is far from them in time and place, so the camera zooms out and in again.
 */
const CLICKS = [
  { t: 2000, x: 900, y: 300 },
  { t: 2600, x: 900, y: 320 },
  { t: 6500, x: 200, y: 500 },
];

function scriptedEvents(): unknown[] {
  const events: unknown[] = [];
  const at = (t: number): { x: number; y: number } => {
    if (t < 1400) return { x: 640, y: 360 };
    if (t < 1600) return { x: 640 + (260 * (t - 1400)) / 200, y: 360 - (60 * (t - 1400)) / 200 };
    if (t < 5000) return { x: 900, y: t < 2400 ? 300 : 320 };
    if (t < 5400) return { x: 900 - (700 * (t - 5000)) / 400, y: 320 + (180 * (t - 5000)) / 400 };
    return { x: 200, y: 500 };
  };
  for (let t = 0; t <= 9000; t += 16) events.push({ type: 'move', t, ...at(t) });
  for (const click of CLICKS) {
    events.push({ type: 'click', t: click.t, x: click.x, y: click.y, button: 'left' });
    events.push({ type: 'release', t: click.t + 80, x: click.x, y: click.y, button: 'left' });
  }
  return events.sort((a, b) => (a as { t: number }).t - (b as { t: number }).t);
}

function frameAt(path: string, seconds: number): Buffer {
  if (tools === undefined) throw new Error('no tools');
  return execFileSync(
    tools.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(seconds),
      '-i',
      path,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: WIDTH * HEIGHT * 3 * 2 },
  );
}

const pixel = (frame: Buffer, x: number, y: number): [number, number, number] => {
  const o = (y * WIDTH + x) * 3;
  return [frame[o] ?? 0, frame[o + 1] ?? 0, frame[o + 2] ?? 0];
};

/** Period of the white grid lines on a row near the top, which the halo never reaches. */
function gridPeriod(frame: Buffer): number {
  const xs: number[] = [];
  let inLine = false;
  for (let x = 0; x < WIDTH; x += 1) {
    const [r, g, b] = pixel(frame, x, 12);
    const bright = r > 200 && g > 200 && b > 200;
    if (bright && !inLine) xs.push(x);
    inLine = bright;
  }
  const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 0;
}

interface Blob {
  count: number;
  x: number;
  y: number;
}

/** Teal pixels: the green ring of the halo and the ripples. The screen itself has none. */
function teal(frame: Buffer, from?: { x: number; y: number; minRadius: number }): Blob {
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b] = pixel(frame, x, y);
      if (g - r > 40 && b - r > 40 && r < 90) {
        if (from !== undefined && Math.hypot(x - from.x, y - from.y) < from.minRadius) continue;
        count += 1;
        sx += x;
        sy += y;
      }
    }
  }
  return { count, x: count === 0 ? 0 : sx / count, y: count === 0 ? 0 : sy / count };
}

describe.skipIf(tools === undefined)('auto zoom and cursor effects in an exported MP4', () => {
  it('zooms after a click, stays in, comes back out, and draws the halo and a ripple per click', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 9 });
    made.push(fixture);
    // A flat grey screen with a white grid: easy to measure and with no teal in it.
    execFileSync(
      tools.ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x707070:s=${WIDTH}x${HEIGHT}:r=30:d=9,drawgrid=w=${GRID}:h=${GRID}:t=4:c=white`,
        '-c:v',
        'libopenh264',
        '-pix_fmt',
        'yuv420p',
        join(fixture.folder, 'screen.mp4'),
      ],
      { stdio: 'ignore' },
    );
    writeFileSync(
      join(fixture.folder, 'Test.scrim.json'),
      JSON.stringify({
        version: 1,
        frame: { width: WIDTH, height: HEIGHT },
        events: scriptedEvents(),
      }),
    );

    const outcome = await exportRecording(
      { paths: tools, run: runProcess, log: () => undefined },
      {
        folder: fixture.folder,
        outputDir: fixture.outputDir,
        collision: 'number',
        settings: {
          preset: 'source',
          fps: 30,
          quality: 'high',
          keepAudio: false,
          micGain: 1,
          shadow: false,
        },
        style: styleFromSettings({
          ...DEFAULT_SETTINGS,
          cameraOn: false,
          backgroundId: 'none',
          zoomLevel: 1.8,
          holdAfterClickMs: 1200,
        }),
        paint: cursorPaintFor('brand'),
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const out = outcome.path;

    // Before any click the picture is not zoomed.
    expect(gridPeriod(frameAt(out, 1.0))).toBe(GRID);

    // The zoom has landed shortly after the first click, and the halo sits on the cursor, which
    // the camera follows.
    const early = frameAt(out, 2.4);
    expect(gridPeriod(early)).toBeGreaterThan(GRID * 1.7);
    const halo = teal(early);
    expect(halo.count).toBeGreaterThan(200);

    // Still zoomed between the two nearby clicks: it did not zoom out and back in.
    const between = frameAt(out, 3.3);
    expect(gridPeriod(between)).toBeGreaterThan(GRID * 1.7);

    // A ripple answers the second click: teal pixels well outside the halo, at its center.
    const answered = frameAt(out, 2.8);
    const center = teal(answered);
    const ripple = teal(answered, { x: center.x, y: center.y, minRadius: 42 });
    expect(ripple.count).toBeGreaterThan(40);

    // After the hold and the ease out the whole screen is back.
    expect(gridPeriod(frameAt(out, 5.0))).toBe(GRID);

    // The last click, far from the first ones, zooms in again, and the halo follows it.
    const last = frameAt(out, 7.4);
    expect(gridPeriod(last)).toBeGreaterThan(GRID * 1.7);
    expect(teal(last).count).toBeGreaterThan(200);
  }, 120_000);

  it('places the halo on the cursor when the camera is at rest', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 9 });
    made.push(fixture);
    execFileSync(
      tools.ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x707070:s=${WIDTH}x${HEIGHT}:r=30:d=9`,
        '-c:v',
        'libopenh264',
        '-pix_fmt',
        'yuv420p',
        join(fixture.folder, 'screen.mp4'),
      ],
      { stdio: 'ignore' },
    );
    writeFileSync(
      join(fixture.folder, 'Test.scrim.json'),
      JSON.stringify({
        version: 1,
        frame: { width: WIDTH, height: HEIGHT },
        events: scriptedEvents(),
      }),
    );
    const outcome = await exportRecording(
      { paths: tools, run: runProcess, log: () => undefined },
      {
        folder: fixture.folder,
        outputDir: fixture.outputDir,
        collision: 'number',
        settings: {
          preset: 'source',
          fps: 30,
          quality: 'high',
          keepAudio: false,
          micGain: 1,
          shadow: false,
        },
        style: styleFromSettings({
          ...DEFAULT_SETTINGS,
          cameraOn: false,
          backgroundId: 'none',
          zoomOn: false,
        }),
        paint: cursorPaintFor('brand'),
      },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // At 1.0 s the cursor is at the middle, at 4.5 s it rests at (900, 320).
    const first = teal(frameAt(outcome.path, 1.0));
    expect(Math.abs(first.x - 640)).toBeLessThan(3);
    expect(Math.abs(first.y - 360)).toBeLessThan(3);
    const second = teal(frameAt(outcome.path, 4.5));
    expect(Math.abs(second.x - 900)).toBeLessThan(3);
    expect(Math.abs(second.y - 320)).toBeLessThan(3);
  }, 120_000);
});
