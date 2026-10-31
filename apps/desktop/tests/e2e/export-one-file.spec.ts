import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * One recording, one MP4, in the real built app. A recording is started through the typed
 * bridge, and then the pill's own buttons are clicked with synthetic events sent to the pill page,
 * so the computer's mouse is never touched. It records the real screen for a few seconds, so it
 * needs a desktop session and `pnpm build` first.
 */
const APP_DIR = join(__dirname, '../..');
const electronPath = createRequire(__filename)('electron') as string;
const ffmpeg = existsSync(join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe'))
  ? join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe')
  : (process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the built app.');
test.describe.configure({ mode: 'serial' });

interface Running {
  child: ChildProcess;
  browser: Browser;
  main: Page;
  userData: string;
  folder: string;
  exports: string;
  lines: string[];
}

let work = '';
test.beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'scrim-pill-e2e-'));
});
test.afterEach(() => {
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // A leftover temp folder is harmless.
  }
});

function killHard(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function launch(): Promise<Running> {
  const userData = join(work, 'user');
  // Working folders go to the projects folder, which follows LOCALAPPDATA. The chosen folder only
  // receives exports, so a recording must leave it empty.
  const local = join(work, 'local');
  const exports = join(work, 'exports');
  const folder = join(local, 'Scrim', 'Projects');
  mkdirSync(userData, { recursive: true });
  mkdirSync(exports, { recursive: true });
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      destinationFolder: exports,
      firstRunDone: true,
      showWelcome: false,
    }),
  );
  const child = spawn(
    electronPath,
    [APP_DIR, `--user-data-dir=${userData}`, '--remote-debugging-port=0'],
    {
      env: { ...process.env, SCRIM_E2E: '', LOCALAPPDATA: local },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
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
  const file = join(userData, 'DevToolsActivePort');
  const deadline = Date.now() + 30_000;
  let port = 0;
  while (Date.now() < deadline && port === 0) {
    if (child.exitCode !== null) throw new Error('Scrim exited early.');
    if (existsSync(file)) port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
    await sleep(200);
  }
  if (port === 0) throw new Error('No debugging port.');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(port)}`);
  const main = await findPage(
    browser,
    (url) => url.includes('index.html') || url.startsWith('app://'),
    30_000,
    ['pill.html', 'region.html', 'recorder.html'],
  );
  await main.waitForFunction(() => 'scrim' in window);
  recent = () => {
    const logDir = join(userData, 'logs');
    const logged = existsSync(logDir)
      ? readdirSync(logDir).flatMap((name) => readFileSync(join(logDir, name), 'utf8').split('\n'))
      : [];
    return [...lines.slice(-8), ...logged.slice(-12), ...pageErrors].join('\n');
  };
  return { child, browser, main, userData, folder, exports, lines };
}

async function findPage(
  browser: Browser,
  match: (url: string) => boolean,
  timeoutMs: number,
  exclude: string[] = [],
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url();
        if (match(url) && !exclude.some((part) => url.includes(part))) return page;
      }
    }
    await sleep(200);
  }
  throw new Error('The page never appeared.');
}

interface Bridge {
  invoke(channel: string, input?: unknown): Promise<unknown>;
}

async function phase(main: Page): Promise<string> {
  return main.evaluate(async () => {
    const bridge = (window as unknown as { scrim: Bridge }).scrim;
    return ((await bridge.invoke('recording:snapshot')) as { phase: string }).phase;
  });
}

/** The last lines the app printed, added to a failure so it explains itself. */
let recent: () => string = () => '';
/** Errors the pill page reported, so a dead button explains itself. */
const pageErrors: string[] = [];

async function waitForPhase(main: Page, expected: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let seen = '';
  while (Date.now() < deadline) {
    seen = await phase(main);
    if (seen === expected) return;
    await sleep(150);
  }
  throw new Error(`The recorder never reached "${expected}", last saw "${seen}".\n${recent()}`);
}

async function startRecording(main: Page): Promise<void> {
  const result = await main.evaluate(async () => {
    const bridge = (window as unknown as { scrim: Bridge }).scrim;
    return await bridge.invoke('recording:start', {
      source: { kind: 'display' },
      camera: { enabled: true },
      mic: { enabled: true },
    });
  });
  expect((result as { ok: boolean }).ok, JSON.stringify(result)).toBe(true);
  await waitForPhase(main, 'recording');
}

function sessionFolders(folder: string): string[] {
  return readdirSync(folder).filter((name) => existsSync(join(folder, name, 'session.json')));
}

interface Job {
  phase: string;
  progress: { fraction: number } | null;
  result: { bytes: number } | null;
  error: { message: string } | null;
}

test('Stop opens the review, Before, After and Compare play, and Export writes one MP4', async () => {
  test.setTimeout(240_000);
  const running = await launch();
  try {
    await startRecording(running.main);
    await sleep(8000);
    const stopped = await running.main.evaluate(async () => {
      const bridge = (window as unknown as { scrim: Bridge }).scrim;
      return await bridge.invoke('recording:stop');
    });
    expect((stopped as { ok: boolean }).ok, JSON.stringify(stopped)).toBe(true);

    // The review screen replaces the start screen, and nothing is written to the chosen folder yet.
    const page = running.main;
    await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.stage')).toHaveCount(0);

    // BEFORE plays straight away.
    const before = page.locator('video[aria-label="Before"]');
    await expect(before).toHaveCount(1);
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Before"]');
      return video !== null && video.readyState >= 2 && video.videoWidth > 0;
    });
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Before"]');
      return video !== null && video.currentTime > 0.3;
    });
    await page.getByRole('button', { name: 'Pause' }).click();

    // The working copy is made in the cache, not in the chosen folder.
    let preview: Job | null = null;
    const deadline = Date.now() + 200_000;
    while (Date.now() < deadline) {
      preview = await running.main.evaluate(async () => {
        const bridge = (window as unknown as { scrim: Bridge }).scrim;
        return (await bridge.invoke('export:latest')) as Job | null;
      });
      if (preview !== null && ['done', 'failed', 'cancelled'].includes(preview.phase)) break;
      await sleep(500);
    }
    expect(preview?.phase, JSON.stringify(preview) + recent()).toBe('done');
    expect(readdirSync(running.exports), 'nothing in the chosen folder before Export').toEqual([]);
    const cache = join(running.userData, 'cache', 'previews');
    expect(readdirSync(cache).filter((name) => name.endsWith('.mp4'))).toHaveLength(1);

    // AFTER plays the finished look.
    await page.getByRole('radio', { name: 'After' }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="After"]');
      return video !== null && video.readyState >= 2 && video.videoWidth > 0;
    });
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="After"]');
      return video !== null && video.currentTime > 0.3;
    });
    await page.getByRole('button', { name: 'Pause' }).click();

    // COMPARE plays both, in step.
    await page.getByRole('radio', { name: 'Compare' }).click();
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => {
      const videos = [...document.querySelectorAll<HTMLVideoElement>('.review-video')];
      return videos.length === 2 && videos.every((video) => video.currentTime > 0.3);
    });
    const gap = await page.evaluate(() => {
      const [first, second] = [...document.querySelectorAll<HTMLVideoElement>('.review-video')];
      return Math.abs((first?.currentTime ?? 0) - (second?.currentTime ?? 99));
    });
    expect(gap).toBeLessThan(0.5);
    await page.getByRole('button', { name: 'Pause' }).click();

    // Export writes the file into the chosen folder, clears the working copy and opens Library.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    let job: Job | null = null;
    const exportDeadline = Date.now() + 200_000;
    while (Date.now() < exportDeadline) {
      if (readdirSync(running.exports).some((name) => name.endsWith('.mp4'))) {
        job = await running.main.evaluate(async () => {
          const bridge = (window as unknown as { scrim: Bridge }).scrim;
          return (await bridge.invoke('export:latest')) as Job | null;
        });
        if (job?.phase === 'done') break;
      }
      await sleep(500);
    }
    expect(job?.phase, JSON.stringify(job) + recent()).toBe('done');
    // The done dialog opens first, with a green progress bar already gone and the actions in it.
    const doneDialog = page.getByRole('dialog', { name: 'Your video is ready' });
    await expect(doneDialog).toBeVisible({ timeout: 20_000 });
    await expect(doneDialog.getByRole('button', { name: 'Show in folder' })).toBeVisible();
    await expect(doneDialog.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(doneDialog.getByRole('button', { name: 'Share' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review your recording' })).toHaveCount(1);
    await doneDialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Review your recording' })).toHaveCount(0);
    expect(readdirSync(cache).filter((name) => name.endsWith('.mp4'))).toHaveLength(0);

    // One new file in the recordings folder, no folders, no partial file.
    const files = readdirSync(running.exports);
    expect(files, files.join(', ')).toHaveLength(1);
    const file = join(running.exports, files[0] ?? '');
    expect(file.endsWith('.mp4')).toBe(true);

    const probe = spawnSync(
      join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,pix_fmt,duration',
        '-of',
        'json',
        file,
      ],
    );
    const streams = (
      JSON.parse(String(probe.stdout)) as {
        streams: { codec_type: string; codec_name: string; pix_fmt?: string; duration: string }[];
      }
    ).streams;
    const video = streams.filter((s) => s.codec_type === 'video');
    const audio = streams.filter((s) => s.codec_type === 'audio');
    expect(video).toHaveLength(1);
    expect(audio).toHaveLength(1);
    expect(video[0]?.codec_name).toBe('h264');
    expect(video[0]?.pix_fmt).toBe('yuv420p');
    expect(audio[0]?.codec_name).toBe('aac');
    expect(Math.abs(Number(video[0]?.duration) - Number(audio[0]?.duration))).toBeLessThan(0.06);

    // The working folder holds the tracks and the session, with the bubble positions.
    const session = JSON.parse(
      readFileSync(
        join(running.folder, sessionFolders(running.folder)[0] ?? '', 'session.json'),
        'utf8',
      ),
    ) as { bubble?: unknown[]; tracks: { kind: string }[] };
    expect(session.bubble?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(session.tracks.map((t) => t.kind).sort()).toEqual(['camera', 'mic', 'screen']);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});
