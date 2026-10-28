import { expect, test, enterApp } from './fixtures';

/**
 * Owner acceptance checks 1 to 4, run against the built app (`pnpm build` first). The area
 * selector check dims the screen for a moment, because the real overlay opens.
 */
test.describe('acceptance: shell', () => {
  test('1. the shortcuts sheet is closed on launch and opens and closes four ways', async ({
    page,
  }) => {
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await enterApp(page);
    const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeHidden();

    await help.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await help.click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();

    await help.click();
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(sheet).toBeHidden();

    await help.click();
    await expect(sheet).toBeVisible();
    await help.click({ force: true });
    await expect(sheet).toBeHidden();
  });

  test('2. the welcome screen has the agreed layout and the credit link opens the owner site', async ({
    page,
    app,
  }) => {
    const brand = page.getByRole('heading', { name: 'Scrim' });
    const pill = page.locator('.version-pill');
    const tagline = page.getByText('Record anything on your screen effortlessly');
    const credit = page.locator('.welcome-credit');
    const button = page.getByRole('button', { name: /get started|continue/i });

    await expect(brand).toBeVisible();
    await expect(brand.locator('svg')).toBeVisible();
    await expect(pill).toHaveText(/^v\d+\.\d+\.\d+/);
    await expect(tagline).toBeVisible();
    await expect(credit).toHaveText('Built by @oyedokunken');
    await expect(page.getByText('Nothing leaves your computer')).toHaveCount(0);

    const [view, b, p, t, c, g] = await Promise.all([
      page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
      brand.boundingBox(),
      pill.boundingBox(),
      tagline.boundingBox(),
      credit.boundingBox(),
      button.boundingBox(),
    ]);
    if (!b || !p || !t || !c || !g) throw new Error('A welcome element has no box.');
    // Brand and version pill share a row at the top left, the pill after the name.
    expect(b.x).toBeLessThan(view.w / 3);
    expect(b.y).toBeLessThan(view.h / 3);
    expect(p.x).toBeGreaterThan(b.x);
    expect(Math.abs(p.y + p.height / 2 - (b.y + b.height / 2))).toBeLessThan(b.height);
    // The tagline sits under the brand and starts at the same left edge.
    expect(t.y).toBeGreaterThan(b.y + b.height - 1);
    expect(Math.abs(t.x - b.x)).toBeLessThan(8);
    // The credit is bottom left and the button bottom right.
    expect(c.x).toBeLessThan(view.w / 3);
    expect(c.y).toBeGreaterThan((view.h * 2) / 3);
    expect(g.x).toBeGreaterThan((view.w * 2) / 3);
    expect(g.y).toBeGreaterThan((view.h * 2) / 3);

    // The link goes to the browser through the one opener and never navigates the app.
    await app.evaluate(({ shell }) => {
      const store = globalThis as unknown as { __opened: string[] };
      store.__opened = [];
      shell.openExternal = (url: string) => {
        store.__opened.push(url);
        return Promise.resolve();
      };
    });
    const before = page.url();
    await credit.getByRole('link', { name: '@oyedokunken' }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened))
      .toEqual(['https://www.oyedokun.dev/']);
    expect(page.url()).toBe(before);
  });

  test('3. every control shows a pointer cursor and reacts on hover', async ({ page }) => {
    const look = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            cursor: s.cursor,
            background: s.backgroundColor,
            color: s.color,
            transform: s.transform,
            decoration: s.textDecorationLine,
            shadow: s.boxShadow,
          };
        });

    const checkHover = async (selector: string, name: string) => {
      const target = page.locator(selector).first();
      await expect(target, name).toBeVisible();
      await page.mouse.move(0, 0);
      const rest = await look(selector);
      await target.hover();
      await expect.poll(() => look(selector), { message: `${name} hover state` }).not.toEqual(rest);
      expect((await look(selector)).cursor, `${name} cursor`).toBe('pointer');
    };

    await checkHover('.welcome-button', 'welcome button');
    await checkHover('.built-by-handle', 'credit handle');

    await enterApp(page);
    const rail = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
    await expect(rail.first()).toBeVisible();

    // Every item in the left bar except the current one reacts; all show a pointer.
    const count = await rail.count();
    expect(count).toBeGreaterThan(3);
    for (let i = 0; i < count; i++) {
      const item = rail.nth(i);
      if ((await item.getAttribute('aria-current')) === 'page') {
        expect(await item.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
        continue;
      }
      await page.mouse.move(0, 0);
      const rest = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
      await item.hover();
      await expect
        .poll(() => item.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe(rest);
      expect(await item.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    }

    await checkHover('button[aria-label="Keyboard shortcuts"]', 'shortcuts button');
    await checkHover('.ui-button-primary', 'primary button');

    // Everything else clickable on this screen has a pointer, and a disabled one says so.
    const cursors = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="radio"], [role="switch"]',
        ),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({
          label: el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30),
          disabled: el.matches(':disabled, [aria-disabled="true"]'),
          cursor: getComputedStyle(el).cursor,
        })),
    );
    for (const item of cursors) {
      expect(item.cursor, item.label).toBe(item.disabled ? 'not-allowed' : 'pointer');
    }
  });

  test('4. Start recording opens the area selector and a region can be drawn', async ({
    page,
    app,
  }) => {
    await enterApp(page);
    await page.getByRole('button', { name: 'Start recording' }).first().click();

    const selector = () =>
      app.windows().find((candidate) => candidate.url().includes('region.html'));
    await expect.poll(() => selector() !== undefined, { timeout: 15_000 }).toBe(true);
    const overlay = selector();
    if (!overlay) throw new Error('The area selector did not open.');
    await overlay.waitForLoadState('domcontentloaded');

    await expect(overlay.locator('body')).toContainText('Drag to choose an area');
    // Draw a region with mouse events sent to the overlay page, then read the size label.
    await overlay.mouse.move(200, 200);
    await overlay.mouse.down();
    await overlay.mouse.move(400, 330, { steps: 4 });
    await overlay.mouse.move(600, 460, { steps: 4 });
    await overlay.mouse.up();
    await expect(overlay.locator('body')).toContainText(/\d+\s*[x×]\s*\d+/);
    const text = await overlay.evaluate(() => document.body.innerText);
    expect(text).toMatch(/\d+\s*[x×]\s*\d+/);

    // Escape cancels and destroys the window, so the key press itself may report the page as closed.
    await overlay.keyboard.press('Escape').catch(() => undefined);
    await expect.poll(() => selector() === undefined, { timeout: 10_000 }).toBe(true);
  });
});
