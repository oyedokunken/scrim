import { chromium, expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The real region overlay in the built app, started by `SCRIM_DEV_TOOL=region`. The box is drawn
 * with synthetic mouse and key events sent to the overlay page itself, so the computer's own mouse
 * and keyboard are never touched. It briefly dims the screen while it runs, and it needs
 * `pnpm build` first and a desktop session.
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
  rmSync(work, { recursive: true, force: true });
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
    { env: { ...process.env, SCRIM_DEV_TOOL: 'region' }, stdio: ['ignore', 'pipe', 'pipe'] },
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

/** A key that ends the selection also closes the page, so the press may report that it is gone. */
async function pressAndClose(page: Page, key: string): Promise<void> {
  try {
    await page.keyboard.press(key);
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
        if (page.url().includes('region.html')) return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The region overlay never appeared.');
}

interface Outcome {
  ok: boolean;
  reason?: string;
  value?: {
    displayId: string;
    crop: { x: number; y: number; width: number; height: number };
    sizePx: { width: number; height: number };
  };
}

function outcomeFrom(line: string): Outcome {
  return JSON.parse(line.slice(line.indexOf('{'))) as Outcome;
}

test('a dragged box is confirmed with Enter, in whole even pixels', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    expect(view.w).toBeGreaterThan(400);

    await page.mouse.move(100, 120);
    await page.mouse.down();
    await page.mouse.move(300, 250, { steps: 5 });
    await page.mouse.move(501, 421, { steps: 5 });
    await page.mouse.up();
    await pressAndClose(page, 'Enter');

    const outcome = outcomeFrom(await running.waitFor('DEV REGION', 20_000));
    expect(outcome.ok).toBe(true);
    const value = outcome.value;
    expect(value).toBeDefined();
    expect((value?.sizePx.width ?? 1) % 2).toBe(0);
    expect((value?.sizePx.height ?? 1) % 2).toBe(0);
    // About 401 by 301 on screen, whatever the display scale.
    const scale = (value?.sizePx.width ?? 0) / (value?.crop.width ?? 1);
    expect(value?.crop.width ?? 0).toBeGreaterThan(395);
    expect(value?.crop.width ?? 0).toBeLessThan(405);
    expect(value?.crop.height ?? 0).toBeGreaterThan(295);
    expect(value?.crop.height ?? 0).toBeLessThan(305);
    expect(Math.round((value?.crop.width ?? 0) * scale)).toBe(value?.sizePx.width);
    expect(typeof value?.displayId).toBe('string');
  } finally {
    killHard(running.child);
  }
});

test('Escape cancels, and a box that is too small is not confirmed', async () => {
  test.setTimeout(90_000);
  const running = await start(join(work, 'user'));
  try {
    const page = await overlayPage(running);
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(230, 230, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(running.lines.some((line) => line.includes('DEV REGION'))).toBe(false);

    await pressAndClose(page, 'Escape');
    const outcome = outcomeFrom(await running.waitFor('DEV REGION', 20_000));
    expect(outcome).toEqual({ ok: false, reason: 'cancelled' });
  } finally {
    killHard(running.child);
  }
});
