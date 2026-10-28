import type { Page } from '@playwright/test';
import { expect, test, enterApp } from './fixtures';

interface Bridge {
  scrim: { invoke: (channel: string) => Promise<unknown> };
}

/** The settings as the main process holds them. */
async function saved(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as unknown as Bridge).scrim.invoke('settings:get'));
}

async function openView(page: Page, name: string): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('acceptance: the Cursor and Zoom pages', () => {
  test('Cursor: tiles and colors change the preview and are saved', async ({ page }) => {
    await openView(page, 'Cursor');
    const preview = page.locator('.cursor-demo');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-style', 'halo-ripples');

    await page.getByRole('button', { name: 'Ripples only' }).click();
    await expect(preview).toHaveAttribute('data-style', 'ripples');
    await page.getByRole('radio', { name: 'Black' }).click();
    await expect(preview).toHaveAttribute('data-halo', 'black');

    await expect
      .poll(async () => saved(page))
      .toMatchObject({
        cursorStyle: 'ripples',
        haloColor: 'black',
      });
    await expect(page.locator('input[type="range"]')).toHaveCount(0);
  });

  test('Zoom: strength, hold and motion change the preview and are saved', async ({ page }) => {
    await openView(page, 'Zoom');
    const preview = page.locator('.zoom-demo');
    await expect(preview).toHaveAttribute('data-strength', 'medium');

    await page.getByRole('button', { name: /Strong 2.4x/ }).click();
    await expect(preview).toHaveAttribute('data-strength', 'strong');
    await page.getByRole('radio', { name: 'Long' }).click();
    await expect(preview).toHaveAttribute('data-hold', 'long');
    await page.getByRole('radio', { name: 'Gentle' }).click();
    await expect(preview).toHaveAttribute('data-motion', 'gentle');

    await expect
      .poll(async () => saved(page))
      .toMatchObject({ zoomLevel: 2.4, holdAfterClickMs: 2000, smoothness: 0.9 });

    await page.getByRole('switch', { name: 'Auto zoom' }).click();
    await expect(preview).toHaveAttribute('data-on', 'false');
    await expect(page.getByRole('radio', { name: 'Short' })).toBeDisabled();
  });

  test('both previews show a still frame with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openView(page, 'Cursor');
    const name = await page
      .locator('.cursor-demo .demo-cursor')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
    await page.getByRole('button', { name: 'Zoom', exact: true }).click();
    const zoomName = await page
      .locator('.zoom-demo .zoom-scene')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(zoomName).toBe('none');
  });

  test('no horizontal overflow on either page', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await openView(page, 'Cursor');
    for (const name of ['Cursor', 'Zoom']) {
      await page.getByRole('button', { name, exact: true }).click();
      const overflow = await page.evaluate(() => {
        const panel = document.querySelector('.shell-panel');
        const main = document.querySelector('.shell-main');
        return [panel, main].some((el) => el !== null && el.scrollWidth > el.clientWidth);
      });
      expect(overflow).toBe(false);
    }
  });
});
