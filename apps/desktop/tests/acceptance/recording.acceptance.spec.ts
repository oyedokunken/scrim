import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Owner acceptance checks 5 and 6 on the real recorder (no fake). It records the real screen for a
 * few seconds, so it needs a desktop session and `pnpm build` first. Two parts cannot be read by a
 * test and stay manual in progress.md: the red dot on the taskbar icon, and dragging by hand. The
 * test checks the drag region instead. That the pill is absent from the video is proved by
 * tests/e2e/pill.spec.ts, which inspects the recorded frames.
 */
const APP_DIR = join(__dirname, '../..');
test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the built app.');

interface Bridge {
  invoke(channel: string, input?: unknown): Promise<unknown>;
}

interface WindowInfo {
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  display: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  visible: boolean;
}

function windows(app: ElectronApplication): Promise<WindowInfo[]> {
  return app.evaluate(({ BrowserWindow, screen }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => ({
        url: w.webContents.getURL(),
        bounds: w.getBounds(),
        display: screen.getDisplayMatching(w.getBounds()).bounds,
        minimized: w.isMinimized(),
        visible: w.isVisible(),
      })),
  );
}

const phase = (main: Page): Promise<string> =>
  main.evaluate(async () => {
    const bridge = (window as unknown as { scrim: Bridge }).scrim;
    return ((await bridge.invoke('recording:snapshot')) as { phase: string }).phase;
  });

test('5 and 6. the pill is small, bottom left and draggable; Pause, Resume and Stop work; it goes away', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'scrim-accept-'));
  const userData = join(work, 'user');
  const folder = join(work, 'recordings');
  mkdirSync(userData, { recursive: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      destinationFolder: folder,
      firstRunDone: true,
      showWelcome: false,
    }),
  );
  const app = await electron.launch({
    args: [APP_DIR, `--user-data-dir=${userData}`],
    env: { ...process.env, SCRIM_E2E: '' },
  });
  try {
    const main = await app.firstWindow();
    await main.waitForFunction(() => 'scrim' in window);
    const started = await main.evaluate(async () => {
      const bridge = (window as unknown as { scrim: Bridge }).scrim;
      return bridge.invoke('recording:start', {
        source: { kind: 'display' },
        camera: { enabled: false },
        mic: { enabled: false },
      });
    });
    expect((started as { ok: boolean }).ok, JSON.stringify(started)).toBe(true);
    await expect.poll(() => phase(main), { timeout: 20_000 }).toBe('recording');

    // 5. The main window is minimized, not closed, so the taskbar keeps its button.
    await expect
      .poll(
        async () => (await windows(app)).some((w) => !w.url.includes('pill.html') && w.minimized),
        { timeout: 15_000 },
      )
      .toBe(true);

    const info = (await windows(app)).find((w) => w.url.includes('pill.html'));
    if (!info) throw new Error('The pill window is missing.');
    expect(info.visible).toBe(true);
    expect(info.bounds.width).toBeLessThanOrEqual(300);
    expect(info.bounds.height).toBeLessThanOrEqual(80);
    expect(info.bounds.x - info.display.x).toBeLessThan(info.display.width / 3);
    expect(info.bounds.y - info.display.y).toBeGreaterThan((info.display.height * 2) / 3);

    const pill = app.windows().find((w) => w.url().includes('pill.html'));
    if (!pill) throw new Error('The pill page is missing.');
    await expect(pill.locator('#timer')).toHaveText(/^\d\d:\d\d$/);
    const regions = await pill.evaluate(() => ({
      anyDrag: [...document.querySelectorAll('*')].some(
        (el) => getComputedStyle(el).getPropertyValue('-webkit-app-region') === 'drag',
      ),
      toggle: getComputedStyle(document.querySelector('#toggle') ?? document.body).getPropertyValue(
        '-webkit-app-region',
      ),
    }));
    expect(regions.anyDrag).toBe(true);
    expect(regions.toggle).toBe('no-drag');

    // 6. Pause, Resume, Stop, then the pill is gone and the main window is back.
    await pill.locator('#toggle').click();
    await expect.poll(() => phase(main), { timeout: 10_000 }).toBe('paused');
    await pill.locator('#toggle').click();
    await expect.poll(() => phase(main), { timeout: 10_000 }).toBe('recording');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await pill.locator('#stop').click();
    await expect
      .poll(async () => !['recording', 'paused'].includes(await phase(main)), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(
        async () => (await windows(app)).some((w) => w.url.includes('pill.html') && w.visible),
        { timeout: 10_000 },
      )
      .toBe(false);
    await expect
      .poll(async () =>
        (await windows(app)).some((w) => !w.url.includes('pill.html') && !w.minimized && w.visible),
      )
      .toBe(true);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
