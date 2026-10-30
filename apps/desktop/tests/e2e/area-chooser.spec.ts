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
 * The area chooser for Record and for Screenshot, in the built app and in the PACKAGED app, with
 * the real buttons: the overlay opens, a region is drawn and confirmed, a recording starts or a PNG
 * is written. The earlier overlay tests ran through a dev trigger and never showed that the buttons
 * opened anything. SCRIM_E2E_TARGET=packaged runs the executable at SCRIM_PACKAGED_EXE (default
 * release/win-unpacked/Scrim.exe). Everything it writes goes to a throwaway folder: the user data,
 * the working folder and the screenshot folder, so nothing touches Videos or Pictures (where
 * Windows Controlled folder access can block an unsigned app).
 */
const APP_DIR = join(__dirname, '../..');
const PACKAGED = process.env['SCRIM_E2E_TARGET'] === 'packaged';
const electronPath = createRequire(__filename)('electron') as string;
const GENERIC = /could not open the area chooser/i;

test.describe.configure({ mode: 'serial' });

interface Running {
  child: ChildProcess;
  browser: Browser;
  main: Page;
  context: ReturnType<Browser['contexts']>[number];
  work: string;
  shots: string;
  projects: string;
}

async function launch(): Promise<Running> {
  const work = mkdtempSync(join(tmpdir(), 'scrim-chooser-'));
  const userData = join(work, 'user');
  const shots = join(work, 'shots');
  const local = join(work, 'local');
  for (const folder of [userData, shots, local]) mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      firstRunDone: true,
      showWelcome: false,
      screenshotFolder: shots,
      destinationFolder: join(work, 'exports'),
    }),
  );
  const flags = [`--user-data-dir=${userData}`, '--remote-debugging-port=0'];
  const exe = PACKAGED
    ? (process.env['SCRIM_PACKAGED_EXE'] ?? join(APP_DIR, 'release', 'win-unpacked', 'Scrim.exe'))
    : electronPath;
  const child = spawn(exe, PACKAGED ? flags : [APP_DIR, ...flags], {
    // The working folder of a recording is under LOCALAPPDATA, so it is moved into the work folder.
    env: { ...process.env, LOCALAPPDATA: local, SCRIM_E2E: '' },
    stdio: 'ignore',
  });
  const portFile = join(userData, 'DevToolsActivePort');
  const deadline = Date.now() + 30_000;
  while (!existsSync(portFile) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port ?? ''}`);
  const context = browser.contexts()[0];
  if (context === undefined) throw new Error('The app exposed no browser context.');
  const main =
    context.pages().find((page) => page.url().includes('index.html')) ?? context.pages()[0];
  if (main === undefined) throw new Error('The app has no main page.');
  await main.waitForFunction(() => 'scrim' in window);
  return { child, browser, main, context, work, shots, projects: join(local, 'Scrim', 'Projects') };
}

async function stop(running: Running | undefined): Promise<void> {
  if (running === undefined) return;
  await running.browser.close().catch(() => undefined);
  if (running.child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(running.child.pid), '/t', '/f'], { stdio: 'ignore' });
  }
  // Helper processes can hold the folder for a moment after the app is gone, so it is retried.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      rmSync(running.work, { recursive: true, force: true });
      return;
    } catch {
      // Still locked. Try again.
    }
  }
}

async function overlayPage(running: Running): Promise<Page> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = running.context.pages().find((page) => page.url().includes('region.html'));
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const text = await running.main.locator('body').innerText();
  throw new Error(`No area overlay opened. The page says: ${text.slice(0, 300)}`);
}

async function draw(overlay: Page): Promise<void> {
  await overlay.locator('#hint').waitFor({ state: 'visible', timeout: 10_000 });
  await overlay.mouse.move(220, 180);
  await overlay.mouse.down();
  await overlay.mouse.move(560, 400, { steps: 8 });
  await overlay.mouse.up();
}

interface Bridge {
  invoke(channel: string, input?: unknown): Promise<unknown>;
}

/** Calls a bridge channel from inside the page, as the app's own screens do. */
function invoke(page: Page, channel: string): Promise<unknown> {
  return page.evaluate(
    (name) => (window as unknown as { scrim: Bridge }).scrim.invoke(name),
    channel,
  );
}

let running: Running | undefined;

test.afterEach(async () => {
  await stop(running);
  running = undefined;
});

test('the overlay covers the whole display, taskbar included', async () => {
  test.setTimeout(90_000);
  running = await launch();
  const { main } = running;
  const take = main.getByRole('button', { name: /take screenshot/i }).first();
  if (!(await take.isVisible())) {
    await main
      .getByRole('button', { name: /screenshot/i })
      .first()
      .click();
  }
  await take.click();
  const overlay = await overlayPage(running);
  await overlay.locator('#hint').waitFor({ state: 'visible', timeout: 10_000 });
  // Windows sizes a new window to the work area, which stops above the taskbar. The overlay must
  // be as big as the display, or a box cannot be drawn over the taskbar and the bottom rows.
  const size = await overlay.evaluate(() => ({
    inner: [window.innerWidth, window.innerHeight],
    display: [screen.width, screen.height],
  }));
  expect(size.inner).toEqual(size.display);
});

test('Start recording opens the chooser, a drawn region starts a recording, and Stop saves it', async () => {
  test.setTimeout(120_000);
  running = await launch();
  const { main } = running;
  await main
    .getByRole('button', { name: /^start recording$/i })
    .first()
    .click();
  const overlay = await overlayPage(running);
  await draw(overlay);
  await overlay.locator('#start').click();
  await expect
    .poll(() => invoke(main, 'recording:snapshot'), { timeout: 30_000 })
    .toMatchObject({ phase: 'recording' });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await invoke(main, 'recording:stop');
  await expect
    .poll(() => (existsSync(running?.projects ?? '') ? readdirSync(running?.projects ?? '') : []), {
      timeout: 30_000,
    })
    .toHaveLength(1);
  expect(await main.locator('body').innerText()).not.toMatch(GENERIC);
});

test('Take screenshot opens the chooser, a drawn region writes a PNG to the chosen folder', async () => {
  test.setTimeout(90_000);
  running = await launch();
  const { main } = running;
  // The button is on the Record view's panel and on the Screenshot view. Take whichever shows first.
  const take = main.getByRole('button', { name: /take screenshot/i }).first();
  if (!(await take.isVisible())) {
    await main
      .getByRole('button', { name: /screenshot/i })
      .first()
      .click();
  }
  await take.click();
  const overlay = await overlayPage(running);
  await draw(overlay);
  await expect
    .poll(() => (existsSync(running?.shots ?? '') ? readdirSync(running?.shots ?? '') : []), {
      timeout: 30_000,
    })
    .toHaveLength(1);
  const file = readdirSync(running.shots)[0] ?? '';
  const header = readFileSync(join(running.shots, file)).subarray(0, 8);
  expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(await main.locator('body').innerText()).not.toMatch(GENERIC);
});
