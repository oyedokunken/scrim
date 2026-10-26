import { expect, test } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The recording engine against the real app: it records the real screen through the hidden
 * recorder page, writes to disk, remuxes with the system FFmpeg and recovers after a hard kill.
 * It needs a desktop session and `ffmpeg` and `ffprobe` on the PATH, and it needs `pnpm build`
 * first. It drives the dev trigger, so it only runs against the built app, never a packaged one.
 *
 * SCRIM_KILL_RUNS=20 repeats the kill and recover test that many times.
 */
const APP_DIR = join(__dirname, '../..');
const electronPath = createRequire(__filename)('electron') as string;
const KILL_RUNS = Number(process.env['SCRIM_KILL_RUNS'] ?? '1');

const hasFfmpeg = ['ffmpeg', 'ffprobe'].every(
  (tool) => spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0,
);

test.skip(
  process.env['SCRIM_E2E_TARGET'] === 'packaged' || !hasFfmpeg,
  'Needs the built app and FFmpeg on the PATH.',
);
test.describe.configure({ mode: 'serial' });

interface Running {
  child: ChildProcess;
  lines: string[];
  waitFor(text: string, timeoutMs: number): Promise<string>;
  exited: Promise<number | null>;
}

function launch(env: Record<string, string>, userData: string): Running {
  const child = spawn(electronPath, [APP_DIR, `--user-data-dir=${userData}`], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  const take = (data: Buffer): void => {
    lines.push(
      ...data
        .toString('utf8')
        .split(/\r?\n/)
        .filter((line) => line !== ''),
    );
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  return {
    child,
    lines,
    async waitFor(text, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = lines.find((line) => line.includes(text));
        if (found !== undefined) return found;
        if (child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const found = lines.find((line) => line.includes(text));
      if (found !== undefined) return found;
      throw new Error(`Never saw "${text}". Output:\n${lines.slice(-15).join('\n')}`);
    },
    exited: new Promise((resolve) => {
      child.once('exit', (code) => {
        resolve(code);
      });
    }),
  };
}

/** A hard kill of the app and every process it started, with no chance to clean up. */
function killHard(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

/** Starts a long recording, lets it run for five seconds and kills the app. Returns the session folder. */
async function recordThenKill(env: Record<string, string>, userData: string): Promise<string> {
  const app = launch(env, userData);
  try {
    const folder = folderFrom(await app.waitFor('DEV RECORD started', 60_000));
    await new Promise((resolve) => setTimeout(resolve, 5000));
    killHard(app.child);
    await app.exited;
    return folder;
  } finally {
    killHard(app.child);
  }
}

function probe(file: string): { codec: string | undefined; seconds: number } {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
    { encoding: 'utf8' },
  );
  expect(result.status, `ffprobe failed for ${file}: ${result.stderr}`).toBe(0);
  const json = JSON.parse(result.stdout) as {
    streams: { codec_type: string; codec_name: string; duration?: string }[];
    format: { duration?: string };
  };
  const video = json.streams.find((stream) => stream.codec_type === 'video');
  return {
    codec: video?.codec_name,
    seconds: Number(json.format.duration ?? video?.duration ?? 0),
  };
}

function folderFrom(line: string): string {
  return /: (.+?\.scrim)/.exec(line)?.[1] ?? '';
}

let work = '';
test.beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'scrim-engine-e2e-'));
});
test.afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

test('records the screen, stops, and leaves playable files and a clean session', async () => {
  test.setTimeout(120_000);
  const userData = join(work, 'user');
  const dest = join(work, 'out');
  const app = launch({ SCRIM_DEV_RECORD: '4', SCRIM_DEV_DEST: dest }, userData);
  try {
    const finished = await app.waitFor('DEV RECORD finished', 90_000);
    const folder = folderFrom(finished);
    expect(existsSync(folder), finished).toBe(true);

    const names = readdirSync(folder);
    expect(names).toEqual(expect.arrayContaining(['session.json']));
    const screen = names.find((name) => /^screen\.(mp4|webm)$/.test(name));
    expect(screen, `files: ${names.join(', ')}`).toBeDefined();
    const media = probe(join(folder, screen ?? ''));
    expect(media.codec).toBeDefined();
    expect(media.seconds).toBeGreaterThan(2.5);

    const session = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      cleanClose: boolean;
      capture: { cursor: string };
    };
    expect(session.cleanClose).toBe(true);
    await app.exited;
  } finally {
    killHard(app.child);
  }
});

for (let run = 1; run <= KILL_RUNS; run += 1) {
  test(`survives a hard kill and recovers a playable file (run ${String(run)} of ${String(KILL_RUNS)})`, async () => {
    test.setTimeout(180_000);
    const userData = join(work, 'user');
    const dest = join(work, 'out');

    const folder = await recordThenKill({ SCRIM_DEV_RECORD: '60', SCRIM_DEV_DEST: dest }, userData);
    const raw = readdirSync(folder).find((name) => name.startsWith('screen.raw.'));
    expect(raw, 'the raw screen file exists after the kill').toBeDefined();
    const before = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      cleanClose: boolean;
    };
    expect(before.cleanClose).toBe(false);

    const second = launch({ SCRIM_DEV_RECOVER: '1', SCRIM_DEV_DEST: dest }, userData);
    try {
      const line = await second.waitFor('DEV RECOVER finished', 90_000);
      expect(folderFrom(line)).toBe(folder);
      await second.exited;
    } finally {
      killHard(second.child);
    }

    const playable = readdirSync(folder).find((name) => /^screen\.(mp4|webm)$/.test(name));
    expect(playable, 'a playable file was made').toBeDefined();
    const media = probe(join(folder, playable ?? ''));
    expect(media.seconds).toBeGreaterThanOrEqual(3);
    const after = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      cleanClose: boolean;
      recovered?: boolean;
    };
    expect(after).toMatchObject({ cleanClose: true, recovered: true });
  });
}
