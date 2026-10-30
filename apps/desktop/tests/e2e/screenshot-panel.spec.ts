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

test.describe('the screenshot page', () => {
  test('has a settings sidebar but no list of screenshots, shows a capture in the main view and clears it when you leave', async ({
    app,
    page,
  }) => {
    const pictures = picturesFixture();
    try {
      const shot = pictures.add('new.png', 10);
      await app.evaluate(({ app: electronApp }, root) => {
        electronApp.setPath('pictures', root);
      }, pictures.root);
      await enterApp(page);
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
      await expect(page.getByRole('complementary').getByText('Save to')).toBeVisible();
      await expect(page.getByRole('heading', { name: /Screenshots\s*\d/ })).toHaveCount(0);

      await send(app, 'screenshot:taken', { path: shot, width: 160, height: 90 });
      await expect(page.getByRole('img', { name: /Screenshot 160 by 90/ })).toBeVisible();

      // Leaving the page clears the main view. The screenshot lives in the Library only.
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
      await expect(page.getByRole('img', { name: /Screenshot 160 by 90/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Take screenshot' }).first()).toBeVisible();
    } finally {
      pictures.cleanup();
    }
  });
});
