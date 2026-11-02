import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { ExportService, type ExportJob } from '../../src/main/export/service';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { customBackgroundId } from '../../src/shared/backgrounds-contract';
import { DEFAULT_SETTINGS, type Look } from '../../src/shared/settings';
import { makeFixture, testFfmpeg } from './support/export-fixture';
import type { Fixture } from './support/export-fixture';

/**
 * Editing a finished recording: the same job the edit pane starts, with a new look, run through the
 * real export service and the real exporter. The finished files are read back as pictures and
 * compared, so a change of background, cursor or zoom has to show in the pixels.
 */
const tools = testFfmpeg();
const made: string[] = [];
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true });
});

const WIDTH = 1280;
const HEIGHT = 720;
const GRID = 80;
const IMAGE_ID = '3f9c2a1e-8d4b-4c7a-9e21-0b5d6a7c8e90';

/** Two clicks close together, so the camera is zoomed in and settled by 2.4 seconds. */
function scriptedEvents(): unknown[] {
  const events: unknown[] = [];
  const at = (t: number): { x: number; y: number } => {
    if (t < 1400) return { x: 640, y: 360 };
    if (t < 1600) return { x: 640 + (260 * (t - 1400)) / 200, y: 360 - (60 * (t - 1400)) / 200 };
    return { x: 900, y: t < 2400 ? 300 : 320 };
  };
  for (let t = 0; t <= 4000; t += 16) events.push({ type: 'move', t, ...at(t) });
  for (const click of [
    { t: 2000, x: 900, y: 300 },
    { t: 2600, x: 900, y: 320 },
  ]) {
    events.push({ type: 'click', t: click.t, x: click.x, y: click.y, button: 'left' });
    events.push({ type: 'release', t: click.t + 80, x: click.x, y: click.y, button: 'left' });
  }
  return events.sort((a, b) => (a as { t: number }).t - (b as { t: number }).t);
}

function encode(source: string, out: string): void {
  if (tools === undefined) throw new Error('no tools');
  const run = (encoder: string): void => {
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
        source,
        '-c:v',
        encoder,
        '-pix_fmt',
        'yuv420p',
        out,
      ],
      { stdio: 'ignore' },
    );
  };
  try {
    run('libopenh264');
  } catch {
    run('libx264');
  }
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

/** Teal pixels: the green ring of the halo and the ripples. The screen itself has none. */
function teal(frame: Buffer): number {
  let count = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b] = pixel(frame, x, y);
      if (g - r > 40 && b - r > 40 && r < 90) count += 1;
    }
  }
  return count;
}

describe.skipIf(tools === undefined)('editing a recording changes the re-rendered video', () => {
  async function render(look: Look): Promise<string> {
    if (tools === undefined) throw new Error('no tools');
    const fixture: Fixture = makeFixture(tools, { seconds: 4 });
    made.push(fixture.root);
    encode(
      `color=c=0x707070:s=${String(WIDTH)}x${String(HEIGHT)}:r=30:d=4,drawgrid=w=${String(GRID)}:h=${String(GRID)}:t=4:c=white`,
      join(fixture.folder, 'screen.mp4'),
    );
    writeFileSync(
      join(fixture.folder, 'Test.scrim.json'),
      JSON.stringify({
        version: 1,
        frame: { width: WIDTH, height: HEIGHT },
        events: scriptedEvents(),
      }),
    );
    const images = mkdtempSync(join(tmpdir(), 'scrim-bg-'));
    made.push(images);
    mkdirSync(images, { recursive: true });
    const imagePath = join(images, `${IMAGE_ID}.png`);
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
        'color=c=0xE06020:s=320x180:d=1',
        '-frames:v',
        '1',
        imagePath,
      ],
      { stdio: 'ignore' },
    );
    const service = new ExportService({
      run: (request, run) =>
        exportRecording({ paths: tools, run: runProcess, log: () => undefined }, request, run),
      settings: () => ({
        ...DEFAULT_SETTINGS,
        cameraOn: false,
        backgroundId: 'none',
        cursorStyle: 'halo-ripples',
        zoomOn: true,
        zoomLevel: 1.8,
        holdAfterClickMs: 1200,
        destinationFolder: fixture.outputDir,
      }),
      backgroundPath: (id) => (id === IMAGE_ID ? imagePath : undefined),
      destination: () => fixture.outputDir,
      previewDir: () => join(fixture.root, 'preview'),
      newId: () => 'job-1',
      log: () => undefined,
    });
    const done = new Promise<ExportJob>((resolve) => {
      service.on((event) => {
        if (['done', 'failed', 'cancelled'].includes(event.job.phase)) resolve(event.job);
      });
    });
    service.start({
      folder: fixture.folder,
      look,
      collision: 'number',
      settings: { quality: 'high', keepAudio: false },
    });
    const job = await done;
    expect(job.error).toBeNull();
    expect(job.result).not.toBeNull();
    const path = job.result?.path ?? '';
    return path;
  }

  it('shows the chosen background around the recording, and none when it is off', async () => {
    const plain = await render({ backgroundId: 'none' });
    const green = await render({ backgroundId: 'deep-green', backgroundPadding: 'medium' });
    // With no background the corner is the recording itself: grey, or a white grid line.
    const [r0, g0, b0] = pixel(frameAt(plain, 1.0), 4, 4);
    expect(Math.abs(g0 - r0)).toBeLessThan(10);
    expect(Math.abs(b0 - r0)).toBeLessThan(10);
    // With the deep green preset the corner is the green gradient and the recording is inset.
    const [r1, g1, b1] = pixel(frameAt(green, 1.0), 4, 4);
    expect(g1 - r1).toBeGreaterThan(40);
    expect(b1 - r1).toBeGreaterThan(40);
    expect(gridPeriod(frameAt(green, 1.0))).toBeLessThan(GRID);
  }, 240_000);

  it("draws the person's own image behind the recording", async () => {
    const own = await render({
      backgroundId: customBackgroundId(IMAGE_ID),
      backgroundPadding: 'large',
    });
    const [r, g, b] = pixel(frameAt(own, 1.0), 4, 4);
    // The picture is solid orange, covered over the whole frame.
    expect(r).toBeGreaterThan(190);
    expect(g).toBeGreaterThan(70);
    expect(g).toBeLessThan(130);
    expect(b).toBeLessThan(80);
  }, 240_000);

  it('turns the halo and ripples off with the cursor style', async () => {
    const withHalo = await render({ backgroundId: 'none', cursorStyle: 'halo-ripples' });
    const off = await render({ backgroundId: 'none', cursorStyle: 'off' });
    expect(teal(frameAt(withHalo, 2.4))).toBeGreaterThan(200);
    expect(teal(frameAt(off, 2.4))).toBeLessThan(20);
  }, 240_000);

  it('zooms further in with a stronger zoom', async () => {
    const subtle = await render({ backgroundId: 'none', zoomOn: true, zoomLevel: 1.4 });
    const strong = await render({ backgroundId: 'none', zoomOn: true, zoomLevel: 2.4 });
    const still = await render({ backgroundId: 'none', zoomOn: false });
    const period = (path: string): number => gridPeriod(frameAt(path, 2.4));
    expect(period(still)).toBe(GRID);
    expect(period(subtle)).toBeGreaterThan(GRID * 1.25);
    expect(period(strong)).toBeGreaterThan(period(subtle) * 1.4);
  }, 360_000);
});
