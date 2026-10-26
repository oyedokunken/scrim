import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    // A private user data dir keeps the single instance lock from clashing with a running Scrim.
    args: [
      join(__dirname, '../..'),
      `--user-data-dir=${mkdtempSync(join(tmpdir(), 'scrim-e2e-'))}`,
      ...(process.env['CI'] ? ['--no-sandbox'] : []),
    ],
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test('launches and shows the window', async () => {
  await expect(page.getByRole('heading', { name: 'Scrim' })).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('the renderer has no Node access', async () => {
  const result = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: typeof (globalThis as { scrim?: unknown }).scrim,
  }));
  expect(result).toEqual({ require: 'undefined', process: 'undefined', bridge: 'object' });
});

test('navigation to an external page is blocked', async () => {
  const before = page.url();
  await page.evaluate(() => {
    globalThis.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
});

test('window.open is denied', async () => {
  const opened = await page.evaluate(() => globalThis.open('https://example.com/') === null);
  expect(opened).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('minimize, maximize and restore work', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized()),
  ).toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.unmaximize();
    BrowserWindow.getAllWindows()[0]?.minimize();
  });
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()),
  ).toBe(true);
});
