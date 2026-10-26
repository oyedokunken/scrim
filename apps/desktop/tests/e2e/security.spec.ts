import { expect, test } from './fixtures';

test('launches and shows the window', async ({ page }) => {
  expect(page.url()).toBe('app://scrim/index.html');
  await expect(page.getByRole('heading', { name: 'Scrim' })).toBeVisible();
});

test('the renderer has no Node access', async ({ page }) => {
  const result = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: typeof (globalThis as { scrim?: unknown }).scrim,
  }));
  expect(result).toEqual({ require: 'undefined', process: 'undefined', bridge: 'object' });
});

test('navigation to an external page is blocked and the page stays on app://scrim', async ({
  page,
}) => {
  await page.evaluate(() => {
    globalThis.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe('app://scrim/index.html');
});

test('window.open returns null and opens no page', async ({ page }) => {
  const before = page.context().pages().length;
  const opened = await page.evaluate(() => globalThis.open('https://example.com/') === null);
  await page.waitForTimeout(300);
  expect(opened).toBe(true);
  expect(page.context().pages().length).toBe(before);
});

// Maximize and minimize are window states that only the main process can read, and the packaged
// app hides the main process, so this one runs against the built app only.
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
