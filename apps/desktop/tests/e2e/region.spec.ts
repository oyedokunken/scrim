import { chromium, expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The real area overlay in the built app, started by `SCRIM_DEV_TOOL=area-pick`, which asks for a
 * recording but starts nothing and takes no picture. The box is drawn and the buttons are pressed
 * with synthetic events sent to the overlay page itself, so the computer's own mouse and keyboard
 * are never touched. It briefly dims the screen while it runs, and it needs `pnpm build` first and
 * a desktop session.
 */
const APP_DIR = join(__dirname, '../..');
const electronPath = createRequire(__filename)('electron') as string;

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the built app.');
test.describe.configure({ mode: 'serial' });

interface Running {
  child: ChildProcess;
  lines: string[];
  port: number;
  waitFor(text: string, timeoutMs: number): Promise<string>;
}

let work = '';
test.beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'scrim-region-e2e-'));
});
test.afterEach(() => {
  // The killed app can hold its folder for a moment on Windows, so retry and then let it go.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // A leftover temp folder is harmless; the next run uses a fresh one.
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

async function start(userData: string): Promise<Running> {
  const child = spawn(
    electronPath,
    [APP_DIR, `--user-data-dir=${userData}`, '--remote-debugging-port=0'],
    { env: { ...process.env, SCRIM_DEV_TOOL: 'area-pick' }, stdio: ['ignore', 'pipe', 'pipe'] },
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (port === 0) throw new Error('No debugging port.');
  return {
    child,
    lines,
    port,
    async waitFor(text, timeoutMs) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const found = lines.find((line) => line.includes(text));
        if (found !== undefined) return found;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Never saw "${text}". Output:\n${lines.slice(-10).join('\n')}`);
    },
  };
}

/** A key or click that ends the flow also closes the page, so the call may report that it is gone. */
async function tolerateClose(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!String(error).includes('closed')) throw error;
  }
}

async function overlayPage(running: Running): Promise<Page> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(running.port)}`);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.url().includes('region.html')) {
          await page.waitForSelector('#pill:not([hidden])', { timeout: 15_000 });
          return page;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The area overlay never appeared.');
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(to[0], to[1], { steps: 4 });
  await page.mouse.up();
}

interface Picked {
  source: {
    kind: string;
    displayId?: string;
    crop?: { x: number; y: number; width: number; height: number };
  };
  camera: { enabled: boolean };
  mic: { enabled: boolean };
}

function pickedFrom(line: string): Picked {
  return JSON.parse(line.slice(line.indexOf('{'))) as Picked;
}

test('draws a region, turns the camera on, starts, and skips the countdown with Enter', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    await expect(page.locator('#toolbar')).toBeHidden();

    await drag(page, [100, 120], [501, 421]);
    await expect(page.locator('#toolbar')).toBeVisible();
    // Whole pixels, and the label says them. The exact numbers depend on the display scale.
    await expect(page.locator('#size')).toHaveText(/^\d+ x \d+$/);
    const label = (await page.locator('#size').textContent()) ?? '';
    const [width, height] = label.split(' x ').map(Number);
    expect((width ?? 1) % 2).toBe(0);
    expect((height ?? 1) % 2).toBe(0);

    await page.locator('#camera').click();
    await expect(page.locator('#camera')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#start').click();
    await expect(page.locator('#count')).toBeVisible();
    await expect(page.locator('#count')).toHaveText('3');
    await tolerateClose(() => page.keyboard.press('Enter'));

    const picked = pickedFrom(await running.waitFor('DEV PICK', 20_000));
    expect(picked.source.kind).toBe('region');
    expect(picked.camera.enabled).toBe(true);
    expect(picked.mic.enabled).toBe(false);
    const crop = picked.source.crop;
    expect(crop?.width ?? 0).toBeGreaterThan(395);
    expect(crop?.width ?? 0).toBeLessThan(405);
    expect(typeof picked.source.displayId).toBe('string');
  } finally {
    killHard(running.child);
  }
});

test('Escape cancels, and a box that is too small shows no toolbar and is not confirmed', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    await drag(page, [200, 200], [230, 230]);
    await expect(page.locator('#size')).toHaveText('Too small');
    await expect(page.locator('#toolbar')).toBeHidden();
    await page.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(running.lines.some((line) => line.includes('DEV PICK'))).toBe(false);

    await tolerateClose(() => page.keyboard.press('Escape'));
    await running.waitFor('"reason":"cancelled"', 20_000);
    expect(running.lines.some((line) => line.includes('DEV PICK'))).toBe(false);
  } finally {
    killHard(running.child);
  }
});

test('a handle resizes the box, and the pill switches to the whole screen', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    await drag(page, [150, 150], [450, 350]);
    const before = (await page.locator('#size').textContent()) ?? '';

    // Drag the right edge handle out by 100 pixels.
    await drag(page, [450, 250], [550, 250]);
    const after = (await page.locator('#size').textContent()) ?? '';
    expect(Number(after.split(' x ')[0]), `before ${before}, after ${after}`).toBeGreaterThan(
      Number(before.split(' x ')[0]),
    );
    expect(after.split(' x ')[1]).toBe(before.split(' x ')[1]);

    await page.locator('#pill button[data-area="display"]').click();
    await expect(page.locator('#frame')).toBeVisible();
    await expect(page.locator('#selection')).toBeHidden();
    await expect(page.locator('#toolbar')).toBeVisible();

    await page.locator('#start').click();
    await tolerateClose(() => page.keyboard.press('Enter'));
    const picked = pickedFrom(await running.waitFor('DEV PICK', 20_000));
    expect(picked.source.kind).toBe('display');
  } finally {
    killHard(running.child);
  }
});

test('the toolbar offers a device list for the camera, and every control has a name', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    await drag(page, [100, 100], [500, 400]);
    await page.locator('#camera-menu').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();

    for (const selector of ['#camera', '#mic', '#camera-menu', '#mic-menu', '#start']) {
      const button = page.locator(selector);
      const name =
        (await button.getAttribute('aria-label')) ??
        (await button.getAttribute('title')) ??
        (await button.textContent()) ??
        '';
      expect(name.trim(), `${selector} has an accessible name`).not.toBe('');
    }
    await tolerateClose(() => page.keyboard.press('Escape'));
  } finally {
    killHard(running.child);
  }
});
