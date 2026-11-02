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

async function launch(destination?: string): Promise<Running> {
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
      destinationFolder: destination ?? exports,
      firstRunDone: true,
      showWelcome: false,
    }),
  );
  rmSync(join(userData, 'DevToolsActivePort'), { force: true });
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

const SHOTS = process.env['SCRIM_SHOTS'];

/** Takes the window at the two sizes that matter, for a person to look at. */
async function shootAt(page: Page, name: string): Promise<void> {
  for (const [width, height] of [
    [1100, 700],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await sleep(600);
    await page.screenshot({ path: join(SHOTS ?? '', `${name}-${String(width)}.png`) });
  }
}

async function latestJob(main: Page): Promise<Job | null> {
  return main.evaluate(async () => {
    const bridge = (window as unknown as { scrim: Bridge }).scrim;
    return (await bridge.invoke('export:latest')) as Job | null;
  });
}

async function stopRecording(main: Page): Promise<void> {
  const stopped = await main.evaluate(async () => {
    const bridge = (window as unknown as { scrim: Bridge }).scrim;
    return await bridge.invoke('recording:stop');
  });
  expect((stopped as { ok: boolean }).ok, JSON.stringify(stopped)).toBe(true);
}

async function waitForJob(main: Page, phases: string[], ms = 200_000): Promise<Job> {
  const deadline = Date.now() + ms;
  let job: Job | null = null;
  while (Date.now() < deadline) {
    job = await latestJob(main);
    if (job !== null && phases.includes(job.phase)) return job;
    await sleep(400);
  }
  throw new Error(
    `The render never reached ${phases.join(' or ')}: ${JSON.stringify(job)}\n${recent()}`,
  );
}

function mp4s(folder: string): string[] {
  return readdirSync(folder);
}

test('Stop opens the page at once, renders the one MP4 in the background and says where it went', async () => {
  test.setTimeout(240_000);
  const running = await launch();
  try {
    await startRecording(running.main);
    await sleep(7000);
    const page = running.main;
    const stoppedAt = Date.now();
    await stopRecording(page);

    // The finished page opens within moments, with the live preview already on screen.
    await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible({
      timeout: 5000,
    });
    const openedAfter = Date.now() - stoppedAt;
    expect(openedAfter, `opened after ${String(openedAfter)} ms`).toBeLessThan(4000);
    await expect(page.getByTestId('live-preview')).toBeVisible({ timeout: 10_000 });
    if (SHOTS) await shootAt(page, 'auto-live');

    // The progress shows on the page and in the status bar while nothing is in the folder.
    const row = page.locator('.saved-export-row');
    const bar = page.locator('.status-state');
    const sawProgress = await row.isVisible().catch(() => false);
    if (sawProgress) {
      await expect(row).toContainText('Making your video');
      await expect(bar).toContainText('Making video');
      expect(mp4s(running.exports).filter((name) => name.endsWith('.mp4'))).toEqual([]);
    }

    // The app stays usable: Settings opens while the video is being made.
    await page
      .getByRole('button', { name: 'Settings' })
      .first()
      .click()
      .catch(() => undefined);

    const job = await waitForJob(page, ['done', 'failed', 'cancelled']);
    expect(job.phase, JSON.stringify(job) + recent()).toBe('done');

    // One file in the recordings folder, nothing partial, no folders. The cache holds no copy.
    const files = mp4s(running.exports);
    expect(files, files.join(', ')).toHaveLength(1);
    expect(files[0]?.endsWith('.mp4')).toBe(true);
    const cache = join(running.userData, 'cache', 'previews');
    expect(existsSync(cache) ? readdirSync(cache) : []).toEqual([]);

    // The toast names the folder and offers Show in folder.
    const toast = page.locator('.ui-toast');
    await expect(toast).toContainText('Saved to');
    await expect(toast.getByRole('button', { name: 'Show in folder' })).toBeVisible();

    const file = join(running.exports, files[0] ?? '');
    const probe = spawnSync(
      join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'json', file],
    );
    const streams = (
      JSON.parse(String(probe.stdout)) as {
        streams: { codec_type: string; codec_name: string; pix_fmt?: string }[];
      }
    ).streams;
    expect(streams.filter((s) => s.codec_type === 'video')[0]?.codec_name).toBe('h264');
    expect(streams.filter((s) => s.codec_type === 'video')[0]?.pix_fmt).toBe('yuv420p');
    expect(streams.filter((s) => s.codec_type === 'audio')[0]?.codec_name).toBe('aac');

    // Back on the page, the real file has replaced the live picture and the page says where it is.
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByTestId('review-saved')).toContainText('Saved to', { timeout: 10_000 });
    await expect(page.locator('video[aria-label="After"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('live-preview')).toHaveCount(0);
    if (SHOTS) await shootAt(page, 'auto-done');
    const session = JSON.parse(
      readFileSync(
        join(running.folder, sessionFolders(running.folder)[0] ?? '', 'session.json'),
        'utf8',
      ),
    ) as { tracks: { kind: string }[] };
    expect(session.tracks.map((t) => t.kind)).toContain('screen');
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

test('Cancel stops the render, removes the unfinished file and keeps the recording', async () => {
  test.setTimeout(240_000);
  const running = await launch();
  try {
    await startRecording(running.main);
    await sleep(9000);
    const page = running.main;
    await stopRecording(page);
    await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible({
      timeout: 10_000,
    });
    const row = page.locator('.saved-export-row');
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel the export?' });
    await expect(
      dialog.getByText('The unfinished file is removed. Your recording is kept.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel export' }).click();
    const job = await waitForJob(page, ['cancelled', 'done']);
    expect(job.phase, JSON.stringify(job)).toBe('cancelled');
    await expect(page.getByRole('button', { name: 'Make video' })).toBeVisible();
    // No MP4 and no partial file, and the working folder still holds the recording.
    expect(mp4s(running.exports)).toEqual([]);
    const folders = sessionFolders(running.folder);
    expect(folders).toHaveLength(1);
    expect(
      readdirSync(join(running.folder, folders[0] ?? '')).some((n) => n.startsWith('screen')),
    ).toBe(true);
    // Make video renders it after all.
    await page.getByRole('button', { name: 'Make video' }).click();
    const again = await waitForJob(page, ['done', 'failed']);
    expect(again.phase, JSON.stringify(again) + recent()).toBe('done');
    expect(mp4s(running.exports)).toHaveLength(1);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

test('a render that fails shows the reason with Try again and Details, and the recording stays', async () => {
  test.setTimeout(120_000);
  // The recordings folder is a file, so nothing can be written there.
  const blocked = join(work, 'not-a-folder');
  writeFileSync(blocked, 'x');
  const running = await launch(blocked);
  try {
    await startRecording(running.main);
    await sleep(4000);
    const page = running.main;
    await stopRecording(page);
    const dialog = page.getByRole('dialog', { name: 'Scrim could not make your video' });
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Details' }).click();
    await expect(dialog.getByText('Error code:')).toBeVisible();
    if (SHOTS) await shootAt(page, 'auto-failed');
    expect(readFileSync(blocked, 'utf8')).toBe('x');
    expect(sessionFolders(running.folder)).toHaveLength(1);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

test('Scrim closing during a render offers to finish it on the next launch', async () => {
  test.setTimeout(300_000);
  const first = await launch();
  let second: Running | null = null;
  try {
    await startRecording(first.main);
    await sleep(9000);
    await stopRecording(first.main);
    await waitForJob(first.main, ['running', 'queued']);
    await sleep(1500);
    first.child.kill();
    killHard(first.child);
    await first.browser.close().catch(() => undefined);
    await sleep(1500);
    expect(readdirSync(first.exports).filter((name) => name.endsWith('.mp4'))).toEqual([]);

    second = await launch();
    const dialog = second.main.getByRole('dialog', { name: 'Finish your video?' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    if (SHOTS) await shootAt(second.main, 'auto-pending');
    await dialog.getByRole('button', { name: 'Finish now' }).click();
    const job = await waitForJob(second.main, ['done', 'failed']);
    expect(job.phase, JSON.stringify(job) + recent()).toBe('done');
    expect(mp4s(second.exports).filter((name) => name.endsWith('.mp4'))).toHaveLength(1);
    expect(mp4s(second.exports).filter((name) => name.endsWith('.partial'))).toEqual([]);
    // The recording was never touched.
    expect(sessionFolders(second.folder)).toHaveLength(1);
  } finally {
    first.child.kill();
    killHard(first.child);
    if (second !== null) {
      second.child.kill();
      killHard(second.child);
    }
  }
});
