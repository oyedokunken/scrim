import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  startMockUpdateServer,
  type MockRelease,
  type MockServer,
} from '../support/mock-update-server';
import { enterApp, expect, test } from './fixtures';

/**
 * The real electron-updater against a local server, in a development run. A development run has
 * no installed app, so the app is pointed at the local feed through two variables that only a
 * non packaged run with SCRIM_E2E set will read. Windows only: the mock serves latest.yml and an
 * .exe, which is the Windows update shape. Nothing here installs anything.
 */
test.skip(process.platform !== 'win32', 'The local feed serves the Windows update files');

let server: MockServer | undefined;

// The updater reads its cache folder name from this file in a development run. Test only.
const DEV_CONFIG = join(__dirname, '../../dev-app-update.yml');
const CACHE_NAME = 'scrim-updater-e2e';
const cacheFolder = (): string =>
  join(process.env['LOCALAPPDATA'] ?? process.env['TEMP'] ?? '', CACHE_NAME);

/**
 * Starts the server before the app launches, because the app reads the feed address at start. A
 * hook that asks for no fixture runs before the app is launched.
 */
function withServer(release: MockRelease | null): void {
  test.beforeEach(async () => {
    server = await startMockUpdateServer(release);
    process.env['SCRIM_E2E_UPDATE_URL'] = server.url;
    writeFileSync(
      DEV_CONFIG,
      `provider: generic
url: ${server.url}
updaterCacheDirName: ${CACHE_NAME}
`,
    );
  });
}

test.afterEach(async () => {
  delete process.env['SCRIM_E2E_UPDATE_URL'];
  rmSync(DEV_CONFIG, { force: true });
  rmSync(cacheFolder(), { recursive: true, force: true });
  await server?.close();
  server = undefined;
});

async function openSettings(page: Page): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

test.describe('a newer version on the server', () => {
  withServer({
    version: '9.9.9',
    file: randomBytes(64 * 1024),
    notes: '<h2>Faster export</h2><ul><li>Fewer crashes</li></ul>',
  });

  test('sends nothing until asked, then finds, downloads and waits for the restart', async ({
    page,
  }) => {
    await openSettings(page);
    const card = page.getByRole('region', { name: 'Updates' });
    // The startup check is off by default, so the server has heard nothing.
    await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(server?.requests).toEqual([]);

    await card.getByRole('button', { name: 'Check for updates' }).click();
    await expect(card.getByRole('button', { name: 'New update available' })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'New update available' }),
    ).toBeVisible();
    expect(server?.requests).toEqual(['/latest.yml']);

    await card.getByRole('button', { name: 'New update available' }).click();
    const dialog = page.getByRole('dialog', { name: 'New update available' });
    await expect(dialog.getByText('Version 9.9.9')).toBeVisible();
    await expect(dialog.getByText('Fewer crashes')).toBeVisible();
    // Finding an update downloaded nothing.
    expect(server?.requests).toEqual(['/latest.yml']);

    await dialog.getByRole('button', { name: 'Update now' }).click();
    await expect(dialog.getByRole('button', { name: 'Restart and install' })).toBeVisible({
      timeout: 20_000,
    });
    expect(server?.requests.some((path) => path.endsWith('.exe'))).toBe(true);

    // Later closes the window and leaves the update waiting on the rail.
    await dialog.getByRole('button', { name: 'Later' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'New update available' }),
    ).toBeVisible();
  });
});

test.describe('a download that does not match its checksum', () => {
  withServer({ version: '9.9.9', file: randomBytes(32 * 1024), sha512: 'AAAA' });

  test('is thrown away and explained', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.getByRole('button', { name: 'New update available' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New update available' });
    await dialog.getByRole('button', { name: 'Update now' }).click();
    await expect(dialog.getByRole('alert')).toContainText('checksum', { timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Restart and install' })).toHaveCount(0);
  });
});

test.describe('the same version on the server', () => {
  withServer({ version: '1.0.0', file: randomBytes(1024) });

  test('says there is no update', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await expect(page.getByText('You have the latest version.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New update available' })).toHaveCount(0);
  });
});

test.describe('a server with no release', () => {
  withServer(null);

  test('explains that nothing was found and leaves the app as it was', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No update information' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });
});
