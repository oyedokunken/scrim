import type { ElectronApplication, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { axeViolations } from './axe';
import { enterApp, expect, removeAfterAppCloses, test } from './fixtures';

/**
 * The one shared video player, in the Library detail of a built app: its own controls, and
 * fullscreen by button, double click and the F key, left again with Escape. It needs `pnpm build`.
 */
const APP_DIR = join(__dirname, '../..');
const ffmpeg = existsSync(join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe'))
  ? join(APP_DIR, 'resources/ffmpeg/ffmpeg.exe')
  : (process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');
const SHOTS = process.env['SCRIM_SHOTS'];

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the main process.');

async function arrange(app: ElectronApplication): Promise<() => void> {
  const root = mkdtempSync(join(tmpdir(), 'scrim-player-'));
  const videos = join(root, 'videos');
  const local = join(root, 'local');
  const pictures = join(root, 'pictures');
  mkdirSync(join(videos, 'Scrim'), { recursive: true });
  mkdirSync(pictures, { recursive: true });
  const project = join(local, 'Scrim', 'Projects', 'Take 1.scrim');
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'session.json'),
    JSON.stringify({
      version: 1,
      id: '6b6f8f64-8f6e-4a4a-9d3a-111111111111',
      name: 'Take 1',
      createdAt: '2026-10-28T10:00:00.000Z',
      app: { version: '1.0.0', os: 'windows', arch: 'x64' },
      pid: 123,
      source: { kind: 'display', origin: { x: 0, y: 0 }, scaleFactor: 1 },
      capture: { cursorInCapture: true },
      tracks: [
        {
          kind: 'screen',
          file: 'screen.webm',
          mimeType: 'video/webm',
          startedAt: 0,
          bytesWritten: 10,
          complete: true,
        },
      ],
      clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
      pauses: [],
      input: { status: 'unavailable', reason: 'error' },
      warnings: [],
      heartbeatAt: '2026-10-28T10:01:00.000Z',
      heartbeatElapsedMs: 42_000,
      cleanClose: true,
    }),
  );
  const made = spawnSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=30',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=20',
      '-t',
      '20',
      '-c:v',
      'libopenh264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-y',
      join(videos, 'Scrim', 'Take 1.mp4'),
    ],
    { encoding: 'utf8' },
  );
  if (made.status !== 0) throw new Error(`ffmpeg failed: ${made.stderr}`);
  await app.evaluate(
    ({ app: electronApp }, args) => {
      electronApp.setPath('pictures', args.pictures);
      electronApp.setPath('videos', args.videos);
      process.env['LOCALAPPDATA'] = args.local;
    },
    { pictures, videos, local },
  );
  return () => {
    removeAfterAppCloses(root);
  };
}

const fullscreenClass = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.fullscreenElement?.className ?? null);

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

test('the Library player has its own controls and goes fullscreen by button, double click and F', async ({
  app,
  page,
}) => {
  test.setTimeout(120_000);
  const cleanup = await arrange(app);
  try {
    await enterApp(page);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Open Take 1' }).click({ position: { x: 8, y: 8 } });
    const detail = page.getByRole('region', { name: /Details for Take 1/ });
    const video = detail.locator('video');
    await expect(video).toBeVisible();

    // No native controls, and the app's own are all there.
    expect(await video.evaluate((element: HTMLVideoElement) => element.controls)).toBe(false);
    for (const name of ['Play', 'Seek', 'Mute', 'Volume', 'Fullscreen']) {
      await expect(
        detail.getByRole(name === 'Seek' || name === 'Volume' ? 'slider' : 'button', {
          name,
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(detail.getByRole('group', { name: 'Speed' })).toBeVisible();
    await expect(detail.locator('.review-time')).toContainText('/');
    expect(await axeViolations(page)).toEqual([]);

    // The button: the request is granted, the player is the fullscreen element, Escape leaves.
    for (const [width, height] of [
      [1100, 700],
      [1920, 1080],
    ] as const) {
      await resize(app, width, height);
      await detail.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      await expect.poll(() => fullscreenClass(page)).toContain('review-player');
      const box = await video.boundingBox();
      const view = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      if (box === null) throw new Error('no box');
      // The picture fills the width or the height of the screen, not the small preview size.
      expect(box.width > view.w * 0.6 || box.height > view.h * 0.6).toBe(true);
      await expect(detail.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `fullscreen-${String(width)}.png`) });
      await page.keyboard.press('Escape');
      await expect.poll(() => fullscreenClass(page)).toBeNull();
      // Escape left fullscreen only. It did not go back to the Library list.
      await expect(detail).toBeVisible();
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `detail-${String(width)}.png`) });
    }

    // The F key.
    await page.keyboard.press('f');
    await expect.poll(() => fullscreenClass(page)).toContain('review-player');
    await page.keyboard.press('f');
    await expect.poll(() => fullscreenClass(page)).toBeNull();

    // A double click on the video.
    await video.dblclick();
    await expect.poll(() => fullscreenClass(page)).toContain('review-player');
    await video.dblclick();
    await expect.poll(() => fullscreenClass(page)).toBeNull();

    // The volume reaches the video, and mute silences it.
    const volume = detail.getByRole('slider', { name: 'Volume' });
    await volume.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
    await expect(volume).toHaveAttribute('aria-valuetext', '40 percent');
    expect(await video.evaluate((element: HTMLVideoElement) => element.volume)).toBeCloseTo(0.4);
    await detail.getByRole('button', { name: 'Mute', exact: true }).click();
    expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    await detail.getByRole('button', { name: 'Unmute', exact: true }).click();
    expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(false);

    // Play and a speed work on the one video.
    await detail.getByRole('button', { name: '2x', exact: true }).click();
    await detail.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(0.5);
    expect(await video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(2);
  } finally {
    cleanup();
  }
});
