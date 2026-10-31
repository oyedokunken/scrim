import { expect, test } from './fixtures';

/**
 * The "Built by @oyedokunken" credit on the welcome screen, in the real built app: a plain link to
 * the owner's website with no popover and no tooltip. Nothing here clicks the link, so no browser
 * opens.
 */
test.describe('the Built by link on the welcome screen', () => {
  test('is one link to the owner website, with a name and no popover', async ({ page }) => {
    const link = page.locator('.built-by-link');
    await expect(link).toBeVisible();
    await expect(link).toContainText('@oyedokunken');
    await expect(link).toHaveAttribute('href', 'https://www.oyedokun.dev/');
    await expect(link).toHaveAttribute('aria-label', /opens in your browser/);
    await expect(page.locator('.built-by-panel')).toHaveCount(0);
    await expect(page.locator('.built-by-tip')).toHaveCount(0);
    await expect(page.locator('.built-by-handle')).toHaveCount(0);
  });

  test('shows no card or tooltip on hover', async ({ page }) => {
    await page.locator('.built-by-link').hover();
    await expect(page.locator('.built-by-panel, .built-by-tip')).toHaveCount(0);
    expect(
      await page.locator('.built-by-link').evaluate((element) => getComputedStyle(element).cursor),
    ).toBe('pointer');
  });

  test('can be reached by keyboard and shows a focus ring', async ({ page }) => {
    const link = page.locator('.built-by-link');
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    const outline = await link.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
