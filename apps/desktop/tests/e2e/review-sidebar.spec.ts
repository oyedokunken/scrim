import type { ElectronApplication, Page } from '@playwright/test';
import { axeViolations } from './axe';
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
  : (process.env['SCRIM_FIXTURE_FFMPEG'] ?? process.env['SCRIM_FFMPEG'] ?? 'ffmpeg');
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
  preview: false,
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

for (const [w, h] of [
  [1920, 1080],
  [1100, 700],
] as const) {
  test(`the finished page has the video on the left and details and actions in a sidebar at ${String(w)} by ${String(h)}`, async ({
    app,
    page,
    userDataDir,
  }) => {
    test.setTimeout(90_000);
    const fixture = build(userDataDir, true);
    try {
      await resize(app, w, h);
      await open(app, page, fixture);
      await send(app, 'export:status', job(fixture, {}));
      await expect(page.getByTestId('live-preview')).toBeVisible();
      const side = page.locator('.review-side');
      const main = page.locator('.review-main');
      await expect(side).toBeVisible();
      for (const label of [
        'Length',
        'Size',
        'Frame rate',
        'Recording file',
        'Video file',
        'Recorded',
        'Saved in',
      ]) {
        await expect(side.getByText(label, { exact: true })).toBeVisible();
      }
      // No Saved to line under the video, and the progress row stays with the video.
      await expect(page.getByText(/^Saved to /)).toHaveCount(0);
      await expect(main.getByRole('status').filter({ hasText: 'Making your video' })).toBeVisible();
      await expect(side.getByRole('status')).toHaveCount(0);
      // The actions are in the sidebar, in this order.
      const names = await side
        .getByRole('group', { name: 'What to do next' })
        .getByRole('button')
        .evaluateAll((all) =>
          all.map((button) =>
            [...button.childNodes]
              .filter((node) => !(node instanceof Element && node.classList.contains('ui-reason')))
              .map((node) => node.textContent ?? '')
              .join('')
              .trim(),
          ),
        );
      expect(names).toEqual(
        process.platform === 'linux'
          ? ['Edit', 'Show in folder', 'Record again', 'Discard']
          : ['Edit', 'Share', 'Show in folder', 'Record again', 'Discard'],
      );
      // Share is off until the video exists, and says why. Linux has no share sheet.
      if (process.platform !== 'linux') {
        const share = side.getByRole('button', { name: 'Share', exact: true });
        await expect(share).toHaveAttribute('aria-disabled', 'true');
        await share.hover();
        await expect(share.locator('.ui-reason')).toBeVisible();
        await page.mouse.move(0, 0);
      }

      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (element === null) return null;
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        const scroller = document.querySelector('.shell-main');
        const sideScroll = document.querySelector('.review-side-scroll');
        return {
          main: rect('.review-main'),
          side: rect('.review-side'),
          actions: rect('.review-side .lib-detail-actions'),
          pageScrolls: scroller !== null && scroller.scrollHeight > scroller.clientHeight + 1,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          sideScrollsSideways:
            sideScroll !== null && sideScroll.scrollWidth > sideScroll.clientWidth,
          sideScrolls: sideScroll !== null && sideScroll.scrollHeight > sideScroll.clientHeight + 1,
          viewport: window.innerHeight,
        };
      });
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `finished-${String(w)}.png`) });
      expect(boxes.main?.right ?? 0).toBeLessThanOrEqual(boxes.side?.left ?? 0);
      expect(boxes.pageScrolls).toBe(false);
      expect(boxes.sideways).toBe(false);
      expect(boxes.sideScrollsSideways).toBe(false);
      // The actions stay on screen, pinned at the bottom of the sidebar.
      expect(boxes.actions?.bottom ?? 0).toBeLessThanOrEqual(boxes.viewport);
      if (w === 1920) expect(boxes.sideScrolls).toBe(false);
      expect(await axeViolations(page)).toEqual([]);
    } finally {
      cleanup(fixture);
    }
  });
}
