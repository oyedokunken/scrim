import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SessionFile } from '@scrim/core';

/** The FFmpeg to test with: the bundled build when it is fetched, or SCRIM_FFMPEG, or the PATH. */
export function testFfmpeg(): { ffmpeg: string; ffprobe: string } | undefined {
  const bundled = resolve(__dirname, '../../../resources/ffmpeg');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    {
      ffmpeg: process.env['SCRIM_FFMPEG'] ?? join(bundled, `ffmpeg${suffix}`),
      ffprobe: process.env['SCRIM_FFPROBE'] ?? join(bundled, `ffprobe${suffix}`),
    },
    { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' },
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate.ffmpeg, ['-version'], { stdio: 'ignore' });
      execFileSync(candidate.ffprobe, ['-version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next one.
    }
  }
  return undefined;
}

export interface FixtureOptions {
  seconds?: number;
  camera?: boolean;
  mic?: boolean;
  pauses?: SessionFile['pauses'];
  /** Where the screen track starts on the main clock, like a real recording that waited to begin. */
  screenStartMs?: number;
}

export interface Fixture {
  root: string;
  folder: string;
  outputDir: string;
}

/**
 * A session folder like the one the recorder leaves, built from synthetic media: a moving test
 * picture for the screen, colour bars for the camera and a tone for the microphone.
 */
export function makeFixture(tools: { ffmpeg: string }, options: FixtureOptions = {}): Fixture {
  const seconds = options.seconds ?? 4;
  const root = mkdtempSync(join(tmpdir(), 'scrim-export-'));
  const folder = join(root, 'Projects', 'Test.scrim');
  const outputDir = join(root, 'Videos', 'Scrim');
  mkdirSync(folder, { recursive: true });
  const run = (args: string[]): void => {
    execFileSync(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: 'ignore',
    });
  };
  const duration = String(seconds);
  run([
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=1280x720:rate=30:duration=${duration}`,
    '-c:v',
    'libopenh264',
    '-pix_fmt',
    'yuv420p',
    join(folder, 'screen.mp4'),
  ]);
  const tracks: SessionFile['tracks'] = [
    {
      kind: 'screen',
      file: 'screen.raw.webm',
      mimeType: 'video/webm;codecs=h264',
      startedAt: options.screenStartMs ?? 0,
      bytesWritten: 1,
      complete: true,
      stoppedAt: (options.screenStartMs ?? 0) + seconds * 1000,
      playableFile: 'screen.mp4',
    },
  ];
  if (options.camera === true) {
    run([
      '-f',
      'lavfi',
      '-i',
      `smptebars=size=640x480:rate=30:duration=${duration}`,
      '-c:v',
      'libopenh264',
      '-pix_fmt',
      'yuv420p',
      join(folder, 'camera.mp4'),
    ]);
    tracks.push({
      kind: 'camera',
      file: 'camera.raw.webm',
      mimeType: 'video/webm;codecs=h264',
      startedAt: (options.screenStartMs ?? 0) + 40,
      bytesWritten: 1,
      complete: true,
      stoppedAt: (options.screenStartMs ?? 0) + seconds * 1000,
      playableFile: 'camera.mp4',
    });
  }
  if (options.mic === true) {
    run([
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${duration}`,
      '-c:a',
      'libopus',
      join(folder, 'mic.webm'),
    ]);
    tracks.push({
      kind: 'mic',
      file: 'mic.raw.webm',
      mimeType: 'audio/webm;codecs=opus',
      startedAt: (options.screenStartMs ?? 0) + 20,
      bytesWritten: 1,
      complete: true,
      stoppedAt: (options.screenStartMs ?? 0) + seconds * 1000,
      playableFile: 'mic.webm',
    });
  }
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
      scaleFactor: 1.5,
      frame: { width: 1280, height: 720 },
    },
    capture: { cursorInCapture: true },
    tracks,
    clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
    pauses: options.pauses ?? [],
    input: { status: 'recorded', file: 'input.ndjson' },
    warnings: [],
    ...(options.camera === true
      ? {
          bubble: [
            { t: 0, corner: 'bl' as const, x: 16, y: 300, size: 120 },
            { t: 2000, corner: 'tl' as const, x: 16, y: 16, size: 120 },
          ],
        }
      : {}),
    heartbeatAt: '2026-10-28T16:27:16.620Z',
    heartbeatElapsedMs: (options.screenStartMs ?? 0) + seconds * 1000,
    cleanClose: true,
  };
  writeFileSync(join(folder, 'session.json'), JSON.stringify(session));
  writeFileSync(join(folder, 'edits.json'), JSON.stringify({ version: 1, trim: null, cuts: [] }));
  const events = [
    { type: 'move', t: 0, x: 200, y: 200 },
    { type: 'move', t: 800, x: 600, y: 300 },
    { type: 'click', t: 1000, x: 600, y: 300, button: 'left' },
    { type: 'release', t: 1080, x: 600, y: 300, button: 'left' },
    { type: 'move', t: 2500, x: 900, y: 500 },
    { type: 'click', t: 2600, x: 900, y: 500, button: 'left' },
  ];
  writeFileSync(
    join(folder, 'Test.scrim.json'),
    JSON.stringify({ version: 1, frame: { width: 1280, height: 720 }, events }),
  );
  return { root, folder, outputDir };
}

export function exists(path: string): boolean {
  return existsSync(path);
}
