import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures';

const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

test('launches and shows the window', async ({ app, page }) => {
  await expect(page.getByRole('heading', { name: 'Scrim' })).toBeVisible();
  expect(await windowCount(app)).toBe(1);
});

test('the renderer has no Node access', async ({ page }) => {
  const result = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: typeof (globalThis as { scrim?: unknown }).scrim,
  }));
  expect(result).toEqual({ require: 'undefined', process: 'undefined', bridge: 'object' });
});

test('navigation to an external page is blocked', async ({ page }) => {
  const before = page.url();
  await page.evaluate(() => {
    globalThis.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
});

test('window.open is denied', async ({ app, page }) => {
  const opened = await page.evaluate(() => globalThis.open('https://example.com/') === null);
  expect(opened).toBe(true);
  expect(await windowCount(app)).toBe(1);
});

test('minimize, maximize and restore work', async ({ app }) => {
  const state = (key: 'isMaximized' | 'isMinimized') =>
    app.evaluate(({ BrowserWindow }, k) => BrowserWindow.getAllWindows()[0]?.[k](), key);
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });
  expect(await state('isMaximized')).toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.unmaximize();
    BrowserWindow.getAllWindows()[0]?.minimize();
  });
  expect(await state('isMinimized')).toBe(true);
});
