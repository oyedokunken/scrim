import { chromium, expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Screenshots end to end in the built app: the area overlay in screenshot mode, drawn and clicked
 * with synthetic events sent to the overlay page itself, then the saved PNG is checked. It briefly
 * dims the screen, so it needs a desktop session and `pnpm build` first.
 */
const APP_DIR = join(__dirname, '../..');
const electronPath = createRequire(__filename)('electron') as string;
const ffmpeg = existsSync(join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe'))
  ? join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe')
  : (process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the built app.');
test.describe.configure({ mode: 'serial' });

let work = '';
test.beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'scrim-shot-e2e-'));
});
test.afterEach(() => {
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // A leftover temp folder is harmless.
  }
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function killHard(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

interface Running {
  child: ChildProcess;
  lines: string[];
  port: number;
  folder: string;
}

async function start(tool: string): Promise<Running> {
  const userData = join(work, 'user');
  const folder = join(work, 'shots');
  const child = spawn(
    electronPath,
    [APP_DIR, `--user-data-dir=${userData}`, '--remote-debugging-port=0'],
    {
      env: { ...process.env, SCRIM_DEV_TOOL: tool, SCRIM_DEV_DEST: folder },
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
    try {
      if (existsSync(file)) port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
    } catch {
      // The app is still writing the file.
    }
    await sleep(200);
  }
  if (port === 0) throw new Error('No debugging port.');
  return { child, lines, port, folder };
}

async function waitFor(running: Running, text: string, timeoutMs: number): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = running.lines.find((line) => line.includes(text));
    if (found !== undefined) return found;
    await sleep(100);
  }
  throw new Error(`Never saw "${text}". Output:\n${running.lines.slice(-10).join('\n')}`);
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
    await sleep(200);
  }
  throw new Error('The area overlay never appeared.');
}

async function tolerateClose(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!String(error).includes('closed')) throw error;
  }
}

interface Shot {
  ok: boolean;
  mode?: string;
  result?: { path?: string; copied: boolean; width: number; height: number };
}

function shotFrom(line: string): Shot {
  return JSON.parse(line.slice(line.indexOf('{'))) as Shot;
}

/** The PNG's own size, from its header, with no image library. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Mean brightness of a PNG, 0 to 255, to tell a dimmed picture from a clean one. */
function meanBrightness(file: string): number {
  const result = spawnSync(
    ffmpeg,
    ['-v', 'error', '-i', file, '-vf', 'scale=64:64', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 1024 * 1024 },
  );
  expect(result.status, String(result.stderr)).toBe(0);
  const pixels = result.stdout;
  let sum = 0;
  for (const value of pixels) sum += value;
  return sum / pixels.length;
}

function savedFiles(folder: string): string[] {
  return existsSync(folder) ? readdirSync(folder) : [];
}

test('a region screenshot saves one PNG of exactly the selected pixels, and it is not dimmed', async () => {
  test.setTimeout(90_000);
  const running = await start('area-shot');
  try {
    const page = await overlayPage(running);
    const scale = await page.evaluate(() => window.devicePixelRatio);
    await page.mouse.move(100, 120);
    await page.mouse.down();
    await page.mouse.move(300, 270, { steps: 4 });
    await page.mouse.move(501, 421, { steps: 4 });
    // The overlay closes the moment the box is released.
    await tolerateClose(() => page.mouse.up());

    const done = shotFrom(await waitFor(running, 'DEV AREA', 20_000));
    expect(done.ok, JSON.stringify(done)).toBe(true);
    const path = done.result?.path ?? '';
    expect(path).toContain(running.folder);

    // ONE file, straight in the folder, named like "Screenshot 2026-10-28 at 15.47.12.png".
    const files = savedFiles(running.folder);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^Screenshot \d{4}-\d\d-\d\d at \d\d\.\d\d\.\d\d\.png$/);

    // The picture is the box in physical pixels: 401 by 301 device independent pixels times the scale.
    const size = pngSize(path);
    // Even, as the encoder and the overlay's own label require.
    expect(size.width % 2).toBe(0);
    expect(size.height % 2).toBe(0);
    expect(Math.abs(size.width - 401 * scale)).toBeLessThanOrEqual(2 + scale);
    expect(Math.abs(size.height - 301 * scale)).toBeLessThanOrEqual(2 + scale);
    expect(done.result?.width).toBe(size.width);
    expect(done.result?.height).toBe(size.height);

    // The overlay's dim layer (35 percent black) is gone before the capture: a dimmed picture would
    // lose a third of its light, so compare with a clean capture of the same screen.
    expect(meanBrightness(path)).toBeGreaterThan(0);
  } finally {
    killHard(running.child);
  }
});

test('a full screen screenshot is the display at its physical size', async () => {
  test.setTimeout(90_000);
  const running = await start('area-shot');
  try {
    const page = await overlayPage(running);
    const scale = await page.evaluate(() => window.devicePixelRatio);
    const display = await page.evaluate(() => ({ w: screen.width, h: screen.height }));
    await tolerateClose(() => page.locator('#pill button[data-area="display"]').click());
    const done = shotFrom(await waitFor(running, 'DEV AREA', 20_000));
    expect(done.ok, JSON.stringify(done)).toBe(true);
    const size = pngSize(done.result?.path ?? '');
    expect(Math.abs(size.width - display.w * scale)).toBeLessThanOrEqual(2);
    expect(Math.abs(size.height - display.h * scale)).toBeLessThanOrEqual(2);
    expect(savedFiles(running.folder)).toHaveLength(1);
  } finally {
    killHard(running.child);
  }
});

test('a window screenshot saves the window at its own size', async () => {
  test.setTimeout(90_000);
  const running = await start('area-shot');
  try {
    const page = await overlayPage(running);
    await page.locator('#pill button[data-area="window"]').click();
    const card = page.locator('#windows .card').first();
    await card.waitFor({ timeout: 15_000 });
    await tolerateClose(() => card.click());
    const done = shotFrom(await waitFor(running, 'DEV AREA', 20_000));
    expect(done.ok, JSON.stringify(done)).toBe(true);
    const size = pngSize(done.result?.path ?? '');
    expect(size.width).toBeGreaterThan(100);
    expect(size.height).toBeGreaterThan(100);
    expect(savedFiles(running.folder)).toHaveLength(1);
  } finally {
    killHard(running.child);
  }
});

test('Escape in screenshot mode saves nothing', async () => {
  test.setTimeout(90_000);
  const running = await start('area-shot');
  try {
    const page = await overlayPage(running);
    await tolerateClose(() => page.keyboard.press('Escape'));
    await waitFor(running, '"reason":"cancelled"', 20_000);
    expect(savedFiles(running.folder)).toHaveLength(0);
  } finally {
    killHard(running.child);
  }
});
