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
import { join } from 'node:path';

/**
 * The floating recording pill in the real built app. A recording is started through the typed
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

async function launch(pillAt?: { x: number; y: number }): Promise<Running> {
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
  if (pillAt !== undefined)
    writeFileSync(join(userData, 'pill-position.json'), JSON.stringify(pillAt));
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
  return { child, browser, main, userData, folder, lines };
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
      camera: { enabled: false },
      mic: { enabled: false },
    });
  });
  expect((result as { ok: boolean }).ok, JSON.stringify(result)).toBe(true);
  await waitForPhase(main, 'recording');
}

function sessionFolders(folder: string): string[] {
  return readdirSync(folder).filter((name) => existsSync(join(folder, name, 'session.json')));
}

test('Pause, Resume and Stop on the pill change the recorder, and Stop leaves a complete session', async () => {
  test.setTimeout(120_000);
  const running = await launch();
  try {
    await startRecording(running.main);
    const pill = await findPill(running.browser);
    await expect(pill.locator('#timer')).toHaveText(/^\d\d:\d\d$/);

    // Hover shows a pointer cursor and a visible hover state on every button.
    for (const selector of ['#toggle', '#stop', '#discard']) {
      const button = pill.locator(selector);
      const rest = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
      await button.hover();
      expect(await button.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
      await expect
        .poll(async () => button.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe(rest);
    }

    await pill.locator('#toggle').click();
    await waitForPhase(running.main, 'paused');
    await expect(pill.locator('#toggle')).toHaveAttribute('aria-label', 'Resume');

    await pill.locator('#toggle').click();
    await waitForPhase(running.main, 'recording');
    await expect(pill.locator('#toggle')).toHaveAttribute('aria-label', 'Pause');
    await sleep(1500);

    await tolerateClose(() => pill.locator('#stop').click());
    await waitForPhase(running.main, 'stopped');
    // The pill is gone once recording ends.
    await expect.poll(() => pill.isClosed(), { timeout: 15_000 }).toBe(true);

    const sessions = sessionFolders(running.folder);
    expect(sessions).toHaveLength(1);
    const folder = join(running.folder, sessions[0] ?? '');
    const session = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      cleanClose?: boolean;
      pauses?: unknown[];
    };
    expect(session.cleanClose).toBe(true);
    expect(session.pauses?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(readdirSync(folder).some((name) => /\.(mp4|webm|mkv)$/.test(name))).toBe(true);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

async function tolerateClose(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!String(error).includes('closed')) throw error;
  }
}

test('Discard asks first, Keep goes back, and Discard moves the recording to the recycle bin', async () => {
  test.setTimeout(120_000);
  const running = await launch();
  try {
    await startRecording(running.main);
    const pill = await findPill(running.browser);

    await pill.locator('#discard').click();
    await expect(pill.locator('#confirm')).toBeVisible();
    await expect(pill.locator('#main')).toBeHidden();
    await pill.locator('#keep').click();
    await expect(pill.locator('#main')).toBeVisible();
    expect(await phase(running.main)).toBe('recording');
    expect(sessionFolders(running.folder)).toHaveLength(1);

    await sleep(1500);
    await pill.locator('#discard').click();
    await tolerateClose(() => pill.locator('#yes').click());
    await expect.poll(() => pill.isClosed(), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => sessionFolders(running.folder).length, { timeout: 20_000 }).toBe(0);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

test('the pill never appears in the recorded video', async () => {
  test.setTimeout(120_000);
  // A saved position puts the pill on a known spot of the primary display.
  const at = { x: 120, y: 120 };
  const running = await launch(at);
  try {
    await startRecording(running.main);
    const pill = await findPill(running.browser);
    await expect(pill.locator('#timer')).toBeVisible();
    await sleep(3000);
    const scale = await running.main.evaluate(() => window.devicePixelRatio);
    await tolerateClose(() => pill.locator('#stop').click());
    await waitForPhase(running.main, 'stopped');

    const folder = join(running.folder, sessionFolders(running.folder)[0] ?? '');
    const video = readdirSync(folder).find((name) => /\.(mp4|webm|mkv)$/.test(name));
    expect(video).toBeDefined();
    // The recording dot is the one record red thing on the pill. The pill is 232 by 40 device
    // independent pixels, and the dot sits inside it, so count record red pixels over that box.
    const width = Math.round(232 * scale);
    const height = Math.round(40 * scale);
    const frame = spawnSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        '1.5',
        '-i',
        join(folder, video ?? ''),
        '-frames:v',
        '1',
        '-vf',
        `crop=${String(width)}:${String(height)}:${String(Math.round(at.x * scale))}:${String(Math.round(at.y * scale))}`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    expect(frame.status, String(frame.stderr)).toBe(0);
    const pixels = frame.stdout;
    expect(pixels.length).toBe(width * height * 3);
    let red = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if ((pixels[i] ?? 0) > 230 && (pixels[i + 1] ?? 255) < 90 && (pixels[i + 2] ?? 255) < 80)
        red += 1;
    }
    expect(red, 'record red pixels where the pill sat').toBeLessThan(5);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

async function findPill(browser: Browser): Promise<Page> {
  const page = await findPage(browser, (url) => url.includes('pill.html'), 20_000);
  page.on('pageerror', (error) => pageErrors.push(`pill page error: ${error.message}`));
  page.on('console', (message) =>
    pageErrors.push(`pill console ${message.type()}: ${message.text()}`),
  );
  const bridge = await page.evaluate(
    () => typeof (window as unknown as { scrimPill?: unknown }).scrimPill,
  );
  pageErrors.push(`pill bridge is ${bridge}`);
  return page;
}
