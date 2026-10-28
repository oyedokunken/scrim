import type { Page } from '@playwright/test';
import { expect, test, enterApp } from '../e2e/fixtures';

const SIZES = [
  { width: 1100, height: 700 },
  { width: 1920, height: 1080 },
] as const;

async function openRecord(page: Page): Promise<void> {
  await enterApp(page);
  await expect(page.locator('.shell')).toBeVisible();
}

/** Elements inside the container that stick out past its right edge, by more than a pixel. */
async function overflowing(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((container) => {
    const root = document.querySelector(container);
    if (!root) return ['missing ' + container];
    const edge = root.getBoundingClientRect().right + 1;
    const found: string[] = [];
    for (const element of root.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > edge) {
        found.push(`${element.tagName}.${element.className}`);
      }
    }
    if (root.scrollWidth > root.clientWidth) found.push('container scrolls sideways');
    return found;
  }, selector);
}

test.describe('layout', () => {
  for (const size of SIZES) {
    test(`right panel has no sideways overflow at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openRecord(page);
      expect(await overflowing(page, '.shell-panel')).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });

    test(`the rail fits above the status bar at ${size.width} by ${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openRecord(page);
      const settings = await page.getByRole('button', { name: 'Settings' }).boundingBox();
      const status = await page.locator('.status-bar').boundingBox();
      expect(settings).not.toBeNull();
      expect(status).not.toBeNull();
      expect((settings?.y ?? 0) + (settings?.height ?? 0)).toBeLessThanOrEqual(status?.y ?? 0);
      await expect(page.getByRole('button', { name: 'Library' })).toBeVisible();
    });
  }

  test('the status bar has no privacy line and its keycaps are not clipped', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await openRecord(page);
    await expect(page.getByText('Nothing leaves')).toHaveCount(0);
    const clipped = await page.evaluate(() => {
      const bar = document.querySelector('.status-bar');
      const end = document.querySelector('.status-end');
      if (!bar || !end) return true;
      return end.getBoundingClientRect().right > bar.getBoundingClientRect().right;
    });
    expect(clipped).toBe(false);
  });
});
