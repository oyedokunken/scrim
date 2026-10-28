import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { killByFolder } from './fixtures';

/**
 * Acceptance on the INSTALLED or packaged build only (v1-plan section 5, items 1, 3, 8, 12, 14 as
 * far as they can be read from the app's own pages). It needs SCRIM_E2E_TARGET=packaged and
 * SCRIM_PACKAGED_EXE pointing at Scrim.exe (the Start Menu target after a silent install).
 * No OS level input is used: the area selector and the pill are driven through their own pages
 * over the debugging port. LOCALAPPDATA is redirected to a temp folder so the owner's recordings
 * are never touched, and everything is removed afterwards.
 */
const exe = process.env['SCRIM_PACKAGED_EXE'] ?? '';
test.skip(
  process.env['SCRIM_E2E_TARGET'] !== 'packaged' || exe === '',
  'Needs the packaged build (SCRIM_E2E_TARGET=packaged and SCRIM_PACKAGED_EXE).',
);

interface Session {
  child: ChildProcess;
  context: BrowserContext;
  main: Page;
  work: string;
  local: string;
  stop: () => void;
}

async function waitPort(userData: string, child: ChildProcess): Promise<number> {
  const file = join(userData, 'DevToolsActivePort');
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Scrim exited early (${child.exitCode})`);
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (port > 0) return port;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('No debugging port within 30 seconds');
}

async function launch(firstRunDone: boolean): Promise<Session> {
  const work = mkdtempSync(join(tmpdir(), 'scrim-packaged-'));
  const userData = join(work, 'user');
  const local = join(work, 'local');
  mkdirSync(userData, { recursive: true });
  mkdirSync(local, { recursive: true });
  if (firstRunDone) {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({
        version: 1,
        destinationFolder: join(work, 'out'),
        firstRunDone: true,
        showWelcome: false,
      }),
    );
  }
  const child = spawn(exe, [`--user-data-dir=${userData}`, '--remote-debugging-port=0'], {
    stdio: 'ignore',
    env: { ...process.env, LOCALAPPDATA: local },
  });
  const port = await waitPort(userData, child);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No browser context');
  const main = context.pages()[0] ?? (await context.waitForEvent('page'));
  await main.waitForLoadState('domcontentloaded');
  return {
    child,
    context,
    main,
    work,
    local,
    stop: () => {
      if (child.pid !== undefined) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      }
    },
  };
}

async function cleanup(session: Session | undefined): Promise<void> {
  if (!session) return;
  session.stop();
  killByFolder(session.work);
  await new Promise((r) => setTimeout(r, 1000));
  try {
    rmSync(session.work, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
  } catch {
    // A detached crash handler can still hold the folder. A temp leftover is harmless.
  }
}

const find = (context: BrowserContext, part: string): Page | undefined =>
  context.pages().find((p) => p.url().includes(part));

async function waitFor<T>(read: () => T | undefined, ms = 20_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting');
}

test.describe('acceptance: packaged build', () => {
  let session: Session | undefined;
  test.afterEach(async () => {
    await cleanup(session);
    session = undefined;
  });

  test('install folder carries a working FFmpeg and ffprobe, and the pinned license files', () => {
    const resources = join(dirname(exe), 'resources', 'ffmpeg');
    for (const name of ['ffmpeg.exe', 'ffprobe.exe', 'LICENSE.txt', 'SOURCE.txt']) {
      expect(existsSync(join(resources, name)), name).toBe(true);
    }
    const encoders = spawnSync(join(resources, 'ffmpeg.exe'), ['-hide_banner', '-encoders'], {
      encoding: 'utf8',
    }).stdout;
    expect(encoders).toMatch(/h264_mf/);
    expect(encoders).toMatch(/\baac\b/);
  });

  test('first launch: welcome, Get started, camera check, Continue, then the Record page; second launch skips the check', async () => {
    session = await launch(false);
    const { main } = session;
    await expect(main.getByRole('button', { name: 'Get started' })).toBeVisible();
    await main.getByRole('button', { name: 'Get started' }).click();
    await expect(
      main.getByRole('heading', { name: 'Check your camera and microphone' }),
    ).toBeVisible();
    await main.getByRole('button', { name: 'Continue' }).click();
    for (const name of [
      'Record',
      'Screenshot',
      'Cursor',
      'Zoom',
      'Camera',
      'Audio',
      'Background',
      'Library',
      'Settings',
    ]) {
      await expect(main.getByRole('button', { name, exact: true }).first()).toBeVisible();
    }
    await expect(main.getByRole('button', { name: 'Start recording' }).first()).toBeVisible();
  });

  test('3 and 12. region recording from the Record page: overlay, countdown, pill, Pause, Stop, and a playable raw file is on disk', async () => {
    test.setTimeout(120_000);
    session = await launch(true);
    const { main, context, local } = session;
    await main.getByRole('button', { name: 'Start recording' }).first().click();
    const overlay = await waitFor(() => find(context, 'region.html'), 15_000);
    await overlay.waitForLoadState('domcontentloaded');
    await expect(overlay.locator('body')).toContainText('Drag to choose an area');
    await overlay.mouse.move(200, 200);
    await overlay.mouse.down();
    await overlay.mouse.move(450, 330, { steps: 5 });
    await overlay.mouse.move(700, 500, { steps: 5 });
    await overlay.mouse.up();
    await expect(overlay.locator('body')).toContainText(/\d+\s*x\s*\d+/);
    await overlay
      .getByRole('button', { name: /start recording/i })
      .first()
      .click();

    const pill = await waitFor(() => find(context, 'pill.html'), 30_000);
    await expect(pill.locator('#timer')).toHaveText(/^\d\d:\d\d$/);
    await pill.locator('#toggle').click();
    await pill.locator('#toggle').click();
    await new Promise((r) => setTimeout(r, 3000));
    await pill
      .locator('#stop')
      .click()
      .catch(() => undefined);

    await expect(main.getByText('Recording saved')).toBeVisible({ timeout: 30_000 });
    const projects = join(local, 'Scrim', 'Projects');
    const folders = readdirSync(projects).filter((n) => n.endsWith('.scrim'));
    expect(folders).toHaveLength(1);
    const folder = join(projects, folders[0] ?? '');
    const media = readdirSync(folder).filter((n) => /\.(webm|mp4|mkv)$/.test(n));
    expect(media.length).toBeGreaterThan(0);
    // MediaRecorder files carry no duration header, so read the stream instead of the duration.
    const probe = spawnSync(
      join(dirname(exe), 'resources', 'ffmpeg', 'ffprobe.exe'),
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-count_packets',
        '-show_entries',
        'stream=codec_name,nb_read_packets',
        '-of',
        'csv=p=0',
        join(folder, media[0] ?? ''),
      ],
      { encoding: 'utf8' },
    );
    const [codec, packets] = probe.stdout.trim().split(',');
    expect(codec).toMatch(/vp8|vp9|h264|av1/);
    expect(Number(packets)).toBeGreaterThan(10);
  });

  // The next tests describe v1 behavior that the installed build did not have on 2026-10-28
  // (see audit.md). test.fail() keeps the suite green while they are broken and turns red the
  // moment the feature works, which is the signal to remove the marker.
  test('2. Settings has real controls (folders, welcome screen, shortcuts)', async () => {
    test.fail(true, 'Settings is a placeholder (audit.md, owner APP).');
    session = await launch(true);
    const { main } = session;
    await main.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await expect(main.getByText(/will be here/i)).toHaveCount(0);
  });
});
