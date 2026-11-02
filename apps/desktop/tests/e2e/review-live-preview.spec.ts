import type { ElectronApplication, Page } from '@playwright/test';
import { enterApp, expect, test } from './fixtures';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * The review screen on a made up recording: a screen track, an optional camera track and a session
 * file, built with FFmpeg. Events are sent to the page the way the main process sends them, so the
 * render can be held "running" for as long as a check needs. It needs `pnpm build` first.
 */
const APP_DIR = join(__dirname, '../..');
const ffmpeg = existsSync(join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe'))
  ? join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe')
  : (process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');
const SHOTS = process.env['SCRIM_SHOTS'];

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the main process.');

function make(args: string[]): void {
  const run = spawnSync(ffmpeg, ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
}

interface Fixture {
  folder: string;
  previews: string;
}

function build(userData: string, withCamera: boolean): Fixture {
  // Recordings live in the projects folder, which follows LOCALAPPDATA on Windows.
  const projects =
    process.platform === 'win32' && process.env['LOCALAPPDATA']
      ? join(process.env['LOCALAPPDATA'], 'Scrim', 'Projects')
      : join(userData, 'Projects');
  const folder = join(projects, `zz-e2e-${String(process.pid)}-${String(Date.now())}.scrim`);
  const previews = join(userData, 'cache', 'previews');
  for (const dir of [folder, previews]) mkdirSync(dir, { recursive: true });
  make([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30',
    '-t',
    '4',
    '-c:v',
    'libvpx',
    '-b:v',
    '1M',
    join(folder, 'screen.webm'),
  ]);
  if (withCamera) {
    make([
      '-f',
      'lavfi',
      '-i',
      'smptebars=size=640x480:rate=30',
      '-t',
      '4',
      '-c:v',
      'libvpx',
      '-b:v',
      '500k',
      join(folder, 'camera.webm'),
    ]);
  }
  const track = (kind: 'screen' | 'camera', file: string) => ({
    kind,
    file,
    mimeType: 'video/webm',
    startedAt: 100,
    bytesWritten: 1000,
    complete: true,
    stoppedAt: 4100,
  });
  writeFileSync(
    join(folder, 'session.json'),
    JSON.stringify({
      version: 1,
      id: '6f1c2f4e-3b3a-4c53-9a0e-0a5a0b6a1e11',
      name: 'zz-e2e',
      createdAt: '2026-11-02T10:00:00.000Z',
      app: { version: '0.0.0', os: 'windows', arch: 'x64' },
      pid: 4242,
      source: {
        kind: 'display',
        origin: { x: 0, y: 0 },
        scaleFactor: 1,
        frame: { width: 1280, height: 720 },
      },
      capture: { cursorInCapture: true },
      tracks: withCamera
        ? [track('screen', 'screen.webm'), track('camera', 'camera.webm')]
        : [track('screen', 'screen.webm')],
      clock: { rendererOffsetMs: 0, uncertaintyMs: 1 },
      pauses: [],
      input: { status: 'unavailable', reason: 'error' },
      warnings: [],
      ...(withCamera ? { bubble: [{ t: 0, corner: 'br', x: 1000, y: 500, size: 200 }] } : {}),
      heartbeatAt: '2026-11-02T10:00:04.000Z',
      heartbeatElapsedMs: 4100,
      cleanClose: true,
    }),
  );
  return { folder, previews };
}

async function send(app: ElectronApplication, channel: string, payload: unknown): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, args) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(args.channel, args.payload);
      }
    },
    { channel, payload },
  );
}

async function resize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.setContentSize(size.width, size.height);
      }
    },
    { width, height },
  );
}

const job = (fixture: Fixture, over: Record<string, unknown>) => ({
  id: 'job-1',
  phase: 'running',
  progress: { frame: 20, totalFrames: 100, fraction: 0.2, etaMs: 20_000, speed: 1 },
  result: null,
  error: null,
  safer: false,
  preview: true,
  recording: basename(fixture.folder),
  ...over,
});

const finished = (folder: string) => ({
  folder,
  name: 'take',
  files: [{ kind: 'screen', path: join(folder, 'screen.webm') }],
  durationMs: 4000,
  bytes: 4096,
  recovered: false,
  warnings: [],
});

async function open(app: ElectronApplication, page: Page, fixture: Fixture): Promise<Page> {
  await enterApp(page);
  await page.evaluate(async () => {
    const bridge = (
      window as unknown as { scrim: { invoke(c: string, i?: unknown): Promise<unknown> } }
    ).scrim;
    await bridge.invoke('settings:set', { cameraOn: true });
  });
  await send(app, 'recording:finished', finished(fixture.folder));
  await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible();
  return page;
}

function cleanup(fixture: Fixture): void {
  try {
    rmSync(fixture.folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // A leftover temp folder is harmless.
  }
}

test('while the video renders the preview shows the camera bubble, plays, and hands over to the file', async ({
  app,
  page,
  userDataDir,
}) => {
  test.setTimeout(120_000);
  const fixture = build(userDataDir, true);
  try {
    await open(app, page, fixture);
    await send(app, 'export:status', job(fixture, {}));

    const canvas = page.getByTestId('live-preview');
    await expect(canvas).toBeVisible();
    await expect(page.getByTestId('live-preview-label')).toHaveText(
      'Preview. Your video is being made.',
    );
    await expect(canvas).toHaveAttribute('data-bubble', 'true', { timeout: 15_000 });

    // The bubble is drawn in the bottom right corner: its pixels differ from the screen's pattern
    // there, and the preview and the label are on screen at both sizes.
    for (const [w, h] of [
      [1100, 700],
      [1920, 1080],
    ] as const) {
      await resize(app, w, h);
      await expect(canvas).toBeVisible();
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `live-${String(w)}.png`) });
    }

    // Play and pause work while the video is being made.
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Screen"]');
      return video !== null && video.currentTime > 0.4;
    });
    await expect(canvas).toHaveAttribute('data-bubble', 'true');
    await page.getByRole('button', { name: 'Pause' }).click();

    // Seek to a moment, then let the file arrive: the real video shows the same moment.
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Screen"]');
      if (video !== null) video.currentTime = 1.5;
    });
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Screen"]');
      return video !== null && Math.abs(video.currentTime - 1.5) < 0.05;
    });
    make([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x720:rate=30',
      '-t',
      '4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      join(fixture.previews, `${basename(fixture.folder, '.scrim')}.mp4`),
    ]);
    await send(
      app,
      'export:status',
      job(fixture, {
        phase: 'done',
        progress: null,
        result: {
          fileName: 'take.mp4',
          durationMs: 4000,
          bytes: 1,
          encoder: 'x264',
          note: null,
          fellBack: false,
        },
      }),
    );
    await expect(page.getByTestId('live-preview')).toHaveCount(0, { timeout: 15_000 });
    const after = page.locator('video[aria-label="After"]');
    await expect(after).toBeVisible();
    const at = await after.evaluate((video: HTMLVideoElement) => video.currentTime);
    expect(Math.abs(at - 1.5)).toBeLessThan(0.2);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'live-after.png') });
  } finally {
    cleanup(fixture);
  }
});

test('a recording without a camera track shows the preview with no bubble', async ({
  app,
  page,
  userDataDir,
}) => {
  test.setTimeout(60_000);
  const fixture = build(userDataDir, false);
  try {
    await open(app, page, fixture);
    await send(app, 'export:status', job(fixture, {}));
    const canvas = page.getByTestId('live-preview');
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>('video[aria-label="Screen"]');
      return video !== null && video.readyState >= 2;
    });
    await expect(canvas).toHaveAttribute('data-bubble', 'false');
  } finally {
    cleanup(fixture);
  }
});

test('export progress and Cancel share one row, and Cancel asks first', async ({
  app,
  page,
  userDataDir,
}) => {
  test.setTimeout(60_000);
  const fixture = build(userDataDir, true);
  try {
    await open(app, page, fixture);
    await send(app, 'export:status', job(fixture, { preview: false }));
    const row = page.locator('.saved-export-row');
    await expect(row).toBeVisible();
    const cancel = row.getByRole('button', { name: 'Cancel' });
    const bar = row.getByRole('progressbar');

    for (const [w, h] of [
      [1100, 700],
      [1920, 1080],
    ] as const) {
      await resize(app, w, h);
      await expect(cancel).toBeVisible();
      const cancelBox = await cancel.boundingBox();
      const barBox = await bar.boundingBox();
      const rowBox = await row.boundingBox();
      if (cancelBox === null || barBox === null || rowBox === null) throw new Error('no boxes');
      // One row: the bar sits left of Cancel and both centres line up, and the row is one button high.
      expect(barBox.x + barBox.width).toBeLessThanOrEqual(cancelBox.x);
      const centre = (box: { y: number; height: number }): number => box.y + box.height / 2;
      expect(Math.abs(centre(cancelBox) - centre(rowBox))).toBeLessThan(40);
      expect(Math.abs(centre(cancelBox) - centre(barBox))).toBeLessThan(40);
      expect(rowBox.height).toBeLessThan(cancelBox.height + 40);
      // Cancel is a normal sized button at the end of the row, and the bar has the rest.
      expect(cancelBox.width).toBeLessThan(160);
      expect(rowBox.x + rowBox.width - (cancelBox.x + cancelBox.width)).toBeLessThan(2);
      expect(barBox.width).toBeGreaterThan(rowBox.width * 0.5);
      const style = await cancel.evaluate((element) => {
        const css = getComputedStyle(element);
        return { color: css.color, background: css.backgroundColor, wrap: css.whiteSpace };
      });
      expect(style.color).toBe('rgb(255, 255, 255)');
      expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(style.wrap).toBe('nowrap');
      await row.scrollIntoViewIfNeeded();
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `row-${String(w)}.png`) });
    }

    await cancel.click();
    const dialog = page.getByRole('dialog', { name: 'Cancel the export?' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText('The unfinished file is removed. Your recording is kept.'),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep exporting' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Cancel export' })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'row-dialog.png') });
    await dialog.getByRole('button', { name: 'Keep exporting' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();
  } finally {
    cleanup(fixture);
  }
});
