import { expect, test } from './fixtures';

/**
 * The "Built by @oyedokunken" card on the welcome screen, in the real built app: hover, click and
 * keyboard open it, the green tooltips name each link, and Escape and a click outside close it.
 * Nothing here clicks a link, so no browser opens.
 */
test.describe('the Built by card on the welcome screen', () => {
  test('opens on hover, shows a green tooltip on an icon, and closes when the pointer leaves', async ({
    page,
  }) => {
    const handle = page.locator('.built-by-handle');
    const panel = page.locator('.built-by-panel');
    await expect(handle).toBeVisible();
    await expect(panel).toBeHidden();

    await handle.hover();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.built-by-link')).toHaveCount(3);

    const github = panel.getByRole('link', { name: /GitHub/ });
    await github.hover();
    const tip = github.locator('.built-by-tip');
    await expect(tip).toHaveAttribute('data-visible', 'true');
    await expect(tip).toHaveText('GitHub');
    const look = await tip.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    // Green with white text, as on the website.
    expect(look.background).toBe('rgb(0, 78, 82)');
    expect(look.color).toBe('rgb(255, 255, 255)');
    expect(await github.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');

    await page.mouse.move(5, 5);
    await expect(panel).toBeHidden();
  });

  test('stays open after a click, and Escape or a click outside closes it', async ({ page }) => {
    const handle = page.locator('.built-by-handle');
    const panel = page.locator('.built-by-panel');

    await handle.click();
    await page.mouse.move(5, 5);
    await expect(panel).toBeVisible();
    await expect(handle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute('aria-expanded', 'false');

    await handle.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(panel).toBeHidden();
  });

  test('opens from the keyboard, and the icons are links with names', async ({ page }) => {
    const handle = page.locator('.built-by-handle');
    const panel = page.locator('.built-by-panel');

    await handle.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /Website/ })).toBeFocused();
    await expect(
      page.getByRole('link', { name: /Website/ }).locator('.built-by-tip'),
    ).toHaveAttribute('data-visible', 'true');
    for (const name of ['Website', 'GitHub', 'LinkedIn']) {
      await expect(panel.getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
        'href',
        /^https:\/\//,
      );
    }
  });

  test('keeps the credit where it was and the card inside the window', async ({ page }) => {
    const credit = page.locator('.welcome-credit');
    const before = await credit.boundingBox();
    await page.locator('.built-by-handle').hover();
    const panel = page.locator('.built-by-panel');
    await expect(panel).toBeVisible();
    const after = await credit.boundingBox();
    expect(after).toEqual(before);
    const box = await panel.boundingBox();
    const width = await page.evaluate(() => window.innerWidth);
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  });
});
