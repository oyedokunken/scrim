import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor } from '../../src/main/export/look';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { ExportRequest } from '../../src/main/export/types';
import { makeFixture, testFfmpeg, type Fixture } from './support/export-fixture';

/**
 * The microphone and camera buttons, proven on a real export: a muted stretch is silent and the
 * bubble is missing during a camera off stretch. Needs FFmpeg with an H.264 encoder.
 */
const tools = testFfmpeg();
const made: Fixture[] = [];
afterAll(() => {
  for (const fixture of made) rmSync(fixture.root, { recursive: true, force: true });
});

function requestFor(fixture: Fixture): ExportRequest {
  return {
    folder: fixture.folder,
    outputDir: fixture.outputDir,
    collision: 'number',
    settings: {
      preset: 'source',
      fps: 30,
      quality: 'medium',
      keepAudio: true,
      micGain: 1,
      shadow: true,
    },
    style: renderStyleFromSettings({ ...DEFAULT_SETTINGS, cameraOn: true }),
    paint: cursorPaintFor('brand'),
  };
}

async function exportOf(fixture: Fixture): Promise<string> {
  if (tools === undefined) throw new Error('no tools');
  const outcome = await exportRecording(
    { paths: tools, run: runProcess, log: () => undefined },
    requestFor(fixture),
  );
  if (!outcome.ok) throw new Error(JSON.stringify(outcome));
  return outcome.path;
}

/** The loudest sample, in dB, of a stretch of the output's sound. */
function peakDb(path: string, from: number, to: number): number {
  if (tools === undefined) throw new Error('no tools');
  const run = spawnSync(
    tools.ffmpeg,
    [
      '-hide_banner',
      '-ss',
      String(from),
      '-t',
      String(to - from),
      '-i',
      path,
      '-vn',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  const match = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(run.stderr);
  if (match === null) throw new Error(`no volume in: ${run.stderr.slice(-400)}`);
  return match[1] === '-inf' ? -Infinity : Number(match[1]);
}

/** A small picture of the frame at a time, as raw RGB. */
function frameAt(path: string, seconds: number): Buffer {
  if (tools === undefined) throw new Error('no tools');
  return execFileSync(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      path,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:180',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
}

/** How many pixels differ clearly between two frames of the same size. */
function differingPixels(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let count = 0;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const delta =
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    if (delta > 90) count += 1;
  }
  return count;
}

describe.skipIf(tools === undefined)('export with the pill toggle log', () => {
  it('is silent in the muted stretch and loud on both sides of it', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, {
      seconds: 4,
      mic: true,
      toggles: [
        { kind: 'mic', on: false, t: 1000 },
        { kind: 'mic', on: true, t: 2000 },
      ],
    });
    made.push(fixture);
    const out = await exportOf(fixture);
    expect(peakDb(out, 0.3, 0.9)).toBeGreaterThan(-30);
    expect(peakDb(out, 1.15, 1.85)).toBeLessThan(-60);
    expect(peakDb(out, 2.2, 3.5)).toBeGreaterThan(-30);
  }, 60_000);

  it('keeps the sound when nothing was muted', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 4, mic: true });
    made.push(fixture);
    const out = await exportOf(fixture);
    expect(peakDb(out, 1.15, 1.85)).toBeGreaterThan(-30);
  }, 60_000);

  it('leaves the bubble out while the camera is off and draws it before and after', async () => {
    if (tools === undefined) return;
    const toggled = makeFixture(tools, {
      seconds: 4,
      camera: true,
      toggles: [
        { kind: 'camera', on: false, t: 1500 },
        { kind: 'camera', on: true, t: 3000 },
      ],
    });
    // The same recording with no camera at all: the picture the bubble must reveal.
    const control = makeFixture(tools, { seconds: 4 });
    made.push(toggled, control);
    const withToggles = await exportOf(toggled);
    const without = await exportOf(control);
    const before = differingPixels(frameAt(withToggles, 1.0), frameAt(without, 1.0));
    const during = differingPixels(frameAt(withToggles, 2.3), frameAt(without, 2.3));
    const after = differingPixels(frameAt(withToggles, 3.5), frameAt(without, 3.5));
    // A 120 point bubble is a couple of thousand pixels at this size, and a gone one is noise.
    expect(before).toBeGreaterThan(500);
    expect(during).toBeLessThan(100);
    expect(after).toBeGreaterThan(500);
  }, 90_000);

  it('still finishes a clean MP4 with the same length when everything is toggled', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, {
      seconds: 4,
      camera: true,
      mic: true,
      toggles: [
        { kind: 'mic', on: false, t: 0 },
        { kind: 'camera', on: false, t: 0 },
      ],
    });
    made.push(fixture);
    const out = await exportOf(fixture);
    const info = JSON.parse(
      execFileSync(tools.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', out], {
        encoding: 'utf8',
      }),
    ) as { format: { duration: string } };
    expect(Number(info.format.duration)).toBeGreaterThan(3.8);
    expect(Number(info.format.duration)).toBeLessThan(4.2);
    expect(peakDb(out, 0.5, 3.5)).toBeLessThan(-60);
  }, 90_000);
});
