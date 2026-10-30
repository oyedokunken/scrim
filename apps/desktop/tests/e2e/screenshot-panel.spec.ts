import type { ElectronApplication } from '@playwright/test';
import { expect, test, enterApp, removeAfterAppCloses } from './fixtures';
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

test.describe('the review screen', () => {
  test('replaces the start screen on the Record view only, with no logo, on no other page', async ({
    app,
    page,
  }) => {
    await enterApp(page);
    await send(app, 'recording:finished', FINISHED);
    const review = page.getByRole('region', { name: 'Review your recording' });
    await expect(review).toBeVisible();
    await expect(page.locator('.stage')).toHaveCount(0);
    await expect(review.locator('svg.brand-mark, .brand-mark')).toHaveCount(0);

    for (const name of PAGES) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
      await expect(page.getByText('Review your recording')).toHaveCount(0);
      await expect(page.locator('.brand-mark:not(.app-header-brand .brand-mark)')).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(review).toBeVisible();
  });
});

test.describe('the screenshot page', () => {
  test('has no sidebar, keeps Save to under the main view, has no list of screenshots, shows a capture in the main view and clears it when you leave', async ({
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
      await expect(page.getByRole('complementary')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Save to' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Screenshots\s*\d/ })).toHaveCount(0);

      await send(app, 'screenshot:taken', { path: shot, width: 160, height: 90 });
      await expect(page.getByRole('img', { name: /Screenshot 160 by 90/ })).toBeVisible();

      // Leaving the page clears the main view. The screenshot lives in the Library only.
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
      await expect(page.getByRole('img', { name: /Screenshot 160 by 90/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Take screenshot' }).first()).toBeVisible();
    } finally {
      removeAfterAppCloses(pictures.root);
    }
  });
});
