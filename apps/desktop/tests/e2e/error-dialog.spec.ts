import type { ElectronApplication } from '@playwright/test';
import { expect, test, enterApp } from './fixtures';

/** Makes the area chooser answer with a failure, the way the main process does when it cannot start. */
async function failAreaRun(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    (globalThis as { __areaCalls?: number }).__areaCalls = 0;
    ipcMain.removeHandler('area:run');
    ipcMain.handle('area:run', () => {
      const probe = globalThis as { __areaCalls?: number };
      probe.__areaCalls = (probe.__areaCalls ?? 0) + 1;
      return {
        ok: false,
        reason: 'rejected',
        error: {
          code: 'screen-permission',
          message: 'Windows did not let Scrim see the screen.',
          nextStep: 'Open the privacy settings and allow screen capture.',
        },
      };
    });
  });
}

const calls = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { __areaCalls?: number }).__areaCalls ?? 0);

test.describe('errors in a dialog', () => {
  test('a failed start shows a closable dialog with Try again and Details', async ({
    app,
    page,
  }) => {
    await failAreaRun(app);
    await enterApp(page);
    await page.getByRole('button', { name: 'Start recording' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Scrim could not start the recording' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Windows did not let Scrim see the screen.');
    await expect(dialog).toContainText('allow screen capture');
    // No red box left in the page.
    await expect(page.locator('.notice.error')).toHaveCount(0);

    await expect(dialog.getByText('Error code: screen-permission')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Details' }).click();
    await expect(dialog.getByText('Error code: screen-permission')).toBeVisible();

    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => calls(app)).toBe(2);
  });

  test('the X, Escape and the Close button close it', async ({ app, page }) => {
    await failAreaRun(app);
    await enterApp(page);
    const dialog = page.getByRole('dialog', { name: 'Scrim could not start the recording' });

    await page.getByRole('button', { name: 'Start recording' }).first().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Start recording' }).first().click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
