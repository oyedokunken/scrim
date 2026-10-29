import type { ElectronApplication } from '@playwright/test';
import { expect, test, enterApp } from './fixtures';
import { picturesFixture } from './png-fixture';

/** Sends an event to every window of the app, as the main process does. */
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

const FINISHED = {
  folder: 'C:\\Scrim-test\\take 1.scrim',
  name: 'take 1',
  files: [{ kind: 'screen', path: 'C:\\Scrim-test\\take 1.scrim\\screen.webm' }],
  durationMs: 12_000,
  bytes: 4096,
  recovered: false,
  warnings: [],
};

const PAGES = [
  'Screenshot',
  'Cursor',
  'Zoom',
  'Camera',
  'Audio',
  'Background',
  'Library',
  'Settings',
] as const;

test.describe('the recording saved card', () => {
  test('shows on the Record view only, with no logo, on no other page', async ({ app, page }) => {
    await enterApp(page);
    await send(app, 'recording:finished', FINISHED);
    const card = page.getByRole('region', { name: 'Recording saved' });
    await expect(card).toBeVisible();
    await expect(card.locator('svg.brand-mark, .brand-mark')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Show in folder' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Record again' })).toBeVisible();

    for (const name of PAGES) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
      await expect(page.getByText('Recording saved')).toHaveCount(0);
      await expect(page.locator('.brand-mark:not(.app-header-brand .brand-mark)')).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Record again' }).click();
    await expect(card).toHaveCount(0);
  });
});

test.describe('the screenshots panel', () => {
  test('counts and lists every screenshot, newest first, and refreshes after a capture', async ({
    app,
    page,
  }) => {
    const pictures = picturesFixture();
    try {
      pictures.add('old.png', 3600);
      const newest = pictures.add('new.png', 10);
      await app.evaluate(({ app: electronApp }, root) => {
        electronApp.setPath('pictures', root);
      }, pictures.root);
      await enterApp(page);
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();

      const panel = page.getByRole('complementary');
      await expect(panel.getByRole('heading', { name: /Screenshots\s*2/ })).toBeVisible();
      const items = panel.locator('.shot-item');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText('new.png');
      await expect(items.nth(1)).toContainText('old.png');
      await expect(items.nth(0).locator('img')).toBeVisible();
      await expect(page.locator('.status-folder')).toContainText('Pictures');

      // A capture from the shortcut: a new file, then the event from the main process.
      const third = pictures.add('third.png', 0);
      await send(app, 'screenshot:taken', { path: third, width: 160, height: 90 });
      await expect(panel.getByRole('heading', { name: /Screenshots\s*3/ })).toBeVisible();
      await expect(items.nth(0)).toContainText('third.png');
      await expect(page.getByRole('img', { name: /Screenshot 160 by 90/ })).toBeVisible();

      // Clicking one opens it.
      await items.nth(1).click();
      await expect(page.getByText(/Saved as new.png/)).toBeVisible();
      expect(newest).toContain('new.png');
    } finally {
      pictures.cleanup();
    }
  });

  test('shows the empty state only when there are none', async ({ app, page }) => {
    const pictures = picturesFixture();
    try {
      await app.evaluate(({ app: electronApp }, root) => {
        electronApp.setPath('pictures', root);
      }, pictures.root);
      await enterApp(page);
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
      const panel = page.getByRole('complementary');
      await expect(panel.getByRole('heading', { name: /Screenshots\s*0/ })).toBeVisible();
      await expect(panel.getByText('Screenshots you take will show up here.')).toBeVisible();
    } finally {
      pictures.cleanup();
    }
  });
});
