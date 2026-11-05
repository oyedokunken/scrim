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
import { readPort, runnerFlags } from './fixtures';

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
  : (process.env['SCRIM_FIXTURE_FFMPEG'] ?? process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');

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

async function launch(
  pillAt?: { x: number; y: number },
  extraArgs: string[] = [],
): Promise<Running> {
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
    [
      APP_DIR,
      `--user-data-dir=${userData}`,
      '--remote-debugging-port=0',
      ...runnerFlags,
      ...extraArgs,
    ],
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
    if (existsSync(file)) port = readPort(file);
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

async function startRecording(main: Page, camera = false, mic = false): Promise<void> {
  const result = await main.evaluate(
    async (devices) => {
      const bridge = (window as unknown as { scrim: Bridge }).scrim;
      return await bridge.invoke('recording:start', {
        source: { kind: 'display' },
        camera: { enabled: devices.camera },
        mic: { enabled: devices.mic },
      });
    },
    { camera, mic },
  );
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
    await expect
      .poll(() => sessionFolders(running.folder).length, {
        timeout: 20_000,
        message: `The recording folder is still there. What the app logged:
${recent()}`,
      })
      .toBe(0);
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
    // The recording dot is the one record red thing on the pill. The pill is 344 by 48 device
    // independent pixels, and the dot sits inside it, so count record red pixels over that box.
    const width = Math.round(344 * scale);
    const height = Math.round(48 * scale);
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

/** Chromium's fake camera and microphone, so the buttons work the same on any machine. */
const FAKE_DEVICES = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

/**
 * Starts a recording with Chromium's fake camera and microphone. With the fake camera, opening
 * the same device from the recorder and from the bubble window now and then ends the recorder's
 * camera track straight away. That is the same with or without the pill buttons, so a run that
 * starts with a lost camera is thrown away and tried again, in a fresh folder.
 */
async function launchWithLiveCamera(): Promise<Running> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const running = await launch(undefined, FAKE_DEVICES);
    await startRecording(running.main, true, true);
    await sleep(2000);
    const lost = await running.main.evaluate(async () => {
      const bridge = (window as unknown as { scrim: Bridge }).scrim;
      const snapshot = (await bridge.invoke('recording:snapshot')) as {
        tracks: { kind: string; ended: boolean }[];
      };
      return snapshot.tracks.some((track) => track.ended);
    });
    if (!lost) return running;
    running.child.kill();
    killHard(running.child);
    await sleep(1500);
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      // A leftover temp folder is harmless.
    }
    work = mkdtempSync(join(tmpdir(), 'scrim-pill-e2e-'));
  }
  throw new Error('The fake camera was lost on every try.');
}

test('the microphone and camera buttons mute and hide, and every press is logged in the session', async () => {
  test.setTimeout(150_000);
  const running = await launchWithLiveCamera();
  try {
    const pill = await findPill(running.browser);
    const mic = pill.locator('#mic');
    const camera = pill.locator('#camera');
    await expect(mic).toHaveAttribute('aria-label', 'Mute microphone');
    await expect(mic).toHaveAttribute('aria-pressed', 'false');
    await expect(camera).toHaveAttribute('aria-label', 'Turn camera off');
    // Two 40 pixel targets, icon only, and out of the Tab order.
    for (const button of [mic, camera]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(40);
      expect(box?.height).toBeGreaterThanOrEqual(40);
      await expect(button).toHaveAttribute('tabindex', '-1');
      expect((await button.textContent())?.trim()).toBe('');
    }
    await sleep(1500);

    await mic.click();
    await expect(mic).toHaveAttribute('aria-label', 'Unmute microphone');
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await camera.click();
    await expect(camera).toHaveAttribute('aria-label', 'Turn camera on');
    // The bubble window is hidden while the camera is off.
    await pill.screenshot({ path: join(work, 'pill-muted.png') });
    mkdirSync(join(APP_DIR, 'test-results'), { recursive: true });
    await pill.screenshot({ path: join(APP_DIR, 'test-results', 'pill-toggles-off.png') });

    // Pausing and resuming keeps both off.
    await pill.locator('#toggle').click();
    await waitForPhase(running.main, 'paused');
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await pill.locator('#toggle').click();
    await waitForPhase(running.main, 'recording');
    await expect(mic).toHaveAttribute('aria-pressed', 'true');
    await expect(camera).toHaveAttribute('aria-pressed', 'true');

    // Two presses in a hurry are one change. The pill answers with the state it ends in.
    await sleep(400);
    await mic.dblclick();
    await sleep(600);
    await expect(mic).toHaveAttribute('aria-pressed', 'false');
    await sleep(400);
    await camera.click();
    await expect(camera).toHaveAttribute('aria-pressed', 'false');
    await sleep(1200);

    await tolerateClose(() => pill.locator('#stop').click());
    await waitForPhase(running.main, 'stopped');
    const folder = join(running.folder, sessionFolders(running.folder)[0] ?? '');
    const session = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      toggles?: { kind: string; on: boolean; t: number }[];
      cleanClose?: boolean;
    };
    expect(session.cleanClose).toBe(true);
    const toggles = session.toggles ?? [];
    expect(toggles.slice(0, 2).map((entry) => `${entry.kind}:${String(entry.on)}`)).toEqual([
      'mic:false',
      'camera:false',
    ]);
    // The double press was one change: the mic has the mute and one unmute, nothing more.
    expect(toggles.filter((entry) => entry.kind === 'mic')).toHaveLength(2);
    expect(toggles.at(-1)).toMatchObject({ kind: 'camera', on: true });
    const times = toggles.map((entry) => entry.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[0] ?? 0).toBeGreaterThan(1000);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});

test('a device that was off before recording shows a disabled button with the reason', async () => {
  test.setTimeout(120_000);
  const running = await launch(undefined, FAKE_DEVICES);
  try {
    await startRecording(running.main, false, true);
    const pill = await findPill(running.browser);
    const camera = pill.locator('#camera');
    await expect(camera).toBeDisabled();
    await expect(camera).toHaveAttribute('title', 'Turned off before you started recording');
    await expect(pill.locator('#mic')).toBeEnabled();
    await camera.click({ force: true }).catch(() => undefined);
    await sleep(500);
    await expect(camera).toHaveAttribute('aria-pressed', 'true');
    await tolerateClose(() => pill.locator('#stop').click());
    await waitForPhase(running.main, 'stopped');
    const folder = join(running.folder, sessionFolders(running.folder)[0] ?? '');
    const session = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      toggles?: unknown[];
    };
    expect(session.toggles ?? []).toEqual([]);
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

test('the camera bubble opens with the camera on, stays out of the video and writes keyframes', async () => {
  test.setTimeout(120_000);
  const running = await launch();
  try {
    await startRecording(running.main, true);
    const bubble = await findPage(running.browser, (url) => url.includes('bubble.html'), 20_000);
    // Whatever the camera shows, paint the round picture and the dot in a colour no desktop has,
    // so a frame that contains them is easy to tell.
    await bubble.evaluate(() => {
      document.querySelector('video')?.setAttribute('hidden', '');
      const picture = document.getElementById('bubble');
      if (picture) picture.style.background = 'rgb(255, 0, 255)';
      const dot = document.getElementById('dot');
      if (dot) dot.style.background = 'rgb(255, 0, 255)';
    });
    const scale = await running.main.evaluate(() => window.devicePixelRatio);
    await sleep(3500);
    const pill = await findPill(running.browser);
    await tolerateClose(() => pill.locator('#stop').click());
    await waitForPhase(running.main, 'stopped');
    await expect.poll(() => bubble.isClosed(), { timeout: 15_000 }).toBe(true);

    const folder = join(running.folder, sessionFolders(running.folder)[0] ?? '');
    const session = JSON.parse(readFileSync(join(folder, 'session.json'), 'utf8')) as {
      source: { origin: { x: number; y: number } };
      bubble?: { t: number; corner: string; x: number; y: number; size: number }[];
    };
    expect(session.bubble?.length ?? 0).toBeGreaterThanOrEqual(1);
    const first = session.bubble?.[0];
    // The bubble follows the saved corner, which is bottom right by default.
    expect(first?.corner).toBe('br');
    expect(first?.size).toBe(180);
    expect(first?.t ?? -1).toBeGreaterThanOrEqual(0);

    const video = readdirSync(folder).find((name) => /^screen.(mp4|webm|mkv)$/.test(name));
    expect(video).toBeDefined();
    const left = Math.round(((first?.x ?? 0) - session.source.origin.x) * scale);
    const top = Math.round(((first?.y ?? 0) - session.source.origin.y) * scale);
    const side = Math.round(180 * scale);
    const frame = spawnSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        '2',
        '-i',
        join(folder, video ?? ''),
        '-frames:v',
        '1',
        '-vf',
        `crop=${String(side)}:${String(side)}:${String(left)}:${String(top)}`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    expect(frame.status, String(frame.stderr)).toBe(0);
    let magenta = 0;
    const pixels = frame.stdout;
    for (let i = 0; i < pixels.length; i += 3) {
      if ((pixels[i] ?? 0) > 230 && (pixels[i + 1] ?? 255) < 40 && (pixels[i + 2] ?? 0) > 230)
        magenta += 1;
    }
    expect(magenta, 'bubble coloured pixels where the bubble sat').toBeLessThan(5);
  } finally {
    running.child.kill();
    killHard(running.child);
  }
});
