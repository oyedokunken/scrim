import { expect, test, enterApp } from './fixtures';

test.describe('the shortcuts sheet', () => {
  test('is closed on launch and opens and closes four ways', async ({ page }) => {
    await enterApp(page);
    const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toBeVisible();
    await expect(sheet).toBeHidden();

    // Escape
    await help.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(help).toBeFocused();

    // The close button
    await help.click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    await expect(help).toBeFocused();

    // The backdrop
    await help.click();
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(sheet).toBeHidden();

    // A second click on the help button, which sits over the backdrop
    await help.click();
    await expect(sheet).toBeVisible();
    // The modal covers the button, so this click lands on the backdrop, which closes the sheet.
    await help.click({ force: true });
    await expect(sheet).toBeHidden();

    // The app still works.
    await page.getByRole('button', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible();
  });
});
