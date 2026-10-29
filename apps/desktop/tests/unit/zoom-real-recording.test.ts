import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor } from '../../src/main/export/look';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { testFfmpeg } from './support/export-fixture';

/**
 * The same chain as the app, on a real capture from this machine: the real screen video and the
 * real mouse log of a recording in the projects folder, with clicks added to the log at known
 * times (the recording itself holds only the click on Stop). It exports with the real exporter and
 * checks the finished MP4 against the raw capture: unchanged where the camera is at rest, changed
 * where it is zoomed. Takes about three minutes, so it runs only with SCRIM_SLOW=1, and skips on a machine without such a recording.
 */
const tools = testFfmpeg();
const root = join(
  process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'),
  'Scrim',
  'Projects',
);
const source = existsSync(root)
  ? readdirSync(root).find(
      (name) =>
        name.endsWith('.scrim') &&
        existsSync(join(root, name, 'screen.mp4')) &&
        readdirSync(join(root, name)).some((file) => file.endsWith('.scrim.json')),
    )
  : undefined;

const made: string[] = [];
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true });
});

/** A small grey picture of the frame at `seconds`, for comparing two videos. */
function gray(path: string, seconds: number): Buffer {
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
      '-vf',
      'scale=192:108:flags=area,format=gray',
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 192 * 108 * 2 },
  );
}

function difference(a: Buffer, b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / a.length;
}

describe.skipIf(process.env['SCRIM_SLOW'] !== '1' || tools === undefined || source === undefined)(
  'auto zoom on a real capture',
  () => {
    it('zooms on the clicks in the finished video and is untouched in between', async () => {
      if (tools === undefined || source === undefined) return;
      const temp = mkdtempSync(join(tmpdir(), 'scrim-real-'));
      made.push(temp);
      const folder = join(temp, 'Real.scrim');
      cpSync(join(root, source), folder, { recursive: true });
      for (const stale of ['export.json']) rmSync(join(folder, stale), { force: true });

      const logName = readdirSync(folder).find((file) => file.endsWith('.scrim.json'));
      if (logName === undefined) return;
      const log = JSON.parse(readFileSync(join(folder, logName), 'utf8')) as {
        frame: { width: number; height: number };
        events: { type: string; t: number; x: number; y: number }[];
      };
      const CLICKS = [
        { t: 1500, x: 960, y: 540 },
        { t: 2700, x: 1100, y: 600 },
        { t: 6500, x: 400, y: 800 },
      ];
      const events = log.events
        .filter((e) => e.type !== 'click' && e.type !== 'release')
        .concat(CLICKS.map((c) => ({ type: 'click', button: 'left', ...c }) as never))
        .sort((a, b) => a.t - b.t);
      writeFileSync(join(folder, logName), JSON.stringify({ ...log, events }));
      writeFileSync(
        join(folder, 'edits.json'),
        JSON.stringify({ version: 1, trim: { startMs: 0, endMs: 9000 }, cuts: [] }),
      );

      const outputDir = join(temp, 'out');
      const outcome = await exportRecording(
        { paths: tools, run: runProcess, log: () => undefined },
        {
          folder,
          outputDir,
          collision: 'number',
          settings: {
            preset: '720p',
            fps: 30,
            quality: 'medium',
            keepAudio: false,
            micGain: 1,
            shadow: false,
          },
          style: renderStyleFromSettings({
            ...DEFAULT_SETTINGS,
            cameraOn: false,
            backgroundId: 'none',
            cursorStyle: 'off',
            zoomLevel: 1.8,
            holdAfterClickMs: 1200,
          }),
          paint: cursorPaintFor('brand'),
        },
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const raw = join(folder, 'screen.mp4');
      const at = (t: number): number => difference(gray(raw, t), gray(outcome.path, t));
      const rest = [0.6, 5.6].map(at);
      const zoomed = [2.4, 7.6].map(at);
      // With the cursor effects off, a camera at rest gives back the capture almost exactly.
      for (const value of rest) expect(value).toBeLessThan(2);
      for (const value of zoomed) expect(value).toBeGreaterThan(Math.max(...rest) * 4);
    }, 400_000);
  },
);
