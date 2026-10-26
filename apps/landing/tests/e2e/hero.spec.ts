import { expect, test, type Locator, type Page } from '@playwright/test';

const demo = (page: Page) => page.getByTestId('hero-demo');
const scale = async (locator: Locator) => (await locator.getAttribute('data-scale')) ?? '';
const time = async (locator: Locator) => Number((await locator.getAttribute('data-time')) ?? 'NaN');

test.describe('the hero demo with JavaScript', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('plays on its own, zooms in on a click and zooms back out', async ({ page }) => {
    const view = demo(page);
    await expect(view).toHaveAttribute('data-playing', 'true');
    await expect.poll(() => scale(view), { timeout: 8000 }).toBe('2.00');
    await expect.poll(() => scale(view), { timeout: 8000 }).toBe('1.00');
  });

  test('the play button pauses and resumes from the same place', async ({ page }) => {
    const view = demo(page);
    const button = page.getByRole('button', { name: 'Play demo' });
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => time(view)).toBeGreaterThan(300);

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(view).toHaveAttribute('data-playing', 'false');
    const pausedAt = await time(view);
    await page.waitForTimeout(600);
    expect(await time(view)).toBe(pausedAt);

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => time(view)).not.toBe(pausedAt);
  });

  test('the Auto zoom switch is the before and after: off shows the full frame', async ({
    page,
  }) => {
    const view = demo(page);
    const toggle = page.getByRole('switch', { name: 'Auto zoom' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Auto zoom is off.')).toBeVisible();
    // Long enough to pass the first click, which zooms the camera when the switch is on.
    for (let i = 0; i < 14; i += 1) {
      expect(await scale(view)).toBe('1.00');
      await page.waitForTimeout(250);
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Auto zoom is on.')).toBeVisible();
    await expect.poll(() => scale(view), { timeout: 9000 }).toBe('2.00');
  });

  test('turning Auto zoom off while paused redraws the frame', async ({ page }) => {
    const view = demo(page);
    // Wait for a zoomed moment, then freeze it.
    await expect.poll(() => scale(view), { timeout: 8000 }).toBe('2.00');
    await page.getByRole('button', { name: 'Play demo' }).click();
    await expect(view).toHaveAttribute('data-playing', 'false');
    await page.getByRole('switch', { name: 'Auto zoom' }).click();
    await expect.poll(() => scale(view)).toBe('1.00');
  });

  test('both controls work from the keyboard', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Play demo' });
    const toggle = page.getByRole('switch', { name: 'Auto zoom' });

    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('both controls are at least 44 pixels in each direction', async ({ page }) => {
    for (const control of [
      page.getByRole('button', { name: 'Play demo' }),
      page.getByRole('switch', { name: 'Auto zoom' }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('pauses when scrolled out of view and resumes on return', async ({ page }) => {
    const view = demo(page);
    await expect(view).toHaveAttribute('data-playing', 'true');
    await page.evaluate(() => {
      document.body.style.minHeight = '5000px';
      window.scrollTo(0, 3000);
    });
    await expect(view).toHaveAttribute('data-playing', 'false');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(view).toHaveAttribute('data-playing', 'true');
  });

  test('pauses when the tab is hidden and resumes when it is shown', async ({ page }) => {
    const view = demo(page);
    await expect(view).toHaveAttribute('data-playing', 'true');
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { value: next, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await setVisibility('hidden');
    await expect(view).toHaveAttribute('data-playing', 'false');
    await setVisibility('visible');
    await expect(view).toHaveAttribute('data-playing', 'true');
  });
});

test.describe('the recording look of the demo', () => {
  test('the REC dot and label are red, like a recording light', async ({ page }) => {
    await page.goto('/');
    const rec = page.getByTestId('hero-demo').locator('span', { hasText: 'REC' }).first();
    await expect(rec).toBeVisible();
    await expect(rec.locator('span').first()).toHaveCSS('background-color', 'rgb(255, 59, 48)');
    await expect(page.getByTestId('hero-demo').getByText('REC', { exact: true })).toHaveCSS(
      'color',
      'rgb(255, 59, 48)',
    );
  });

  test('the timeline has a time ruler, a clock and a flag that follow playback', async ({
    page,
  }) => {
    await page.goto('/');
    const timeline = page
      .locator('section[aria-labelledby="hero-title"]')
      .getByText('Timeline')
      .locator('xpath=ancestor::div[2]');
    for (const label of ['00:00', '00:03', '00:06', '00:09', '00:12', '00:15', '00:18']) {
      await expect(timeline.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(timeline.getByText('/ 00:18')).toBeVisible();

    // The clock moves with playback.
    await expect
      .poll(
        async () =>
          await timeline
            .locator('span')
            .filter({ hasText: /^00:0[1-9]$/ })
            .count(),
      )
      .toBeGreaterThan(0);
  });

  test('dragging the timeline moves the demo to that time', async ({ page }) => {
    await page.goto('/');
    const view = page.getByTestId('hero-demo');
    await page.getByRole('button', { name: 'Play demo' }).click();
    await expect(view).toHaveAttribute('data-playing', 'false');
    const slider = page.getByRole('slider', { name: 'Demo position' });
    await slider.focus();
    await slider.fill('6500');
    await expect.poll(async () => Number((await view.getAttribute('data-time')) ?? '0')).toBe(6500);
    await expect(view).toHaveAttribute('data-scale', '2.00');
  });
});

test.describe('layout stability', () => {
  test('the page and the hero cause no layout shift while the demo runs', async ({ page }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __shift: number };
      store.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) {
            store.__shift += shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3500);
    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    expect(shift).toBeLessThan(0.001);
  });

  test('the demo keeps its 16 by 9 shape at every width', async ({ page }) => {
    await page.goto('/');
    const box = await demo(page).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the demo shows a real first frame and the download button is a plain link', async ({
    page,
  }) => {
    await page.goto('/');
    const view = demo(page);
    await expect(view).toBeVisible();
    const box = await view.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(100);
    await expect(view.locator('svg text', { hasText: 'Team tasks' }).first()).toBeAttached();
    const button = page.locator('section[aria-labelledby="hero-title"] a[data-download-trigger]');
    await expect(button).toHaveAttribute('href', 'https://github.com/oyedokunken/scrim/releases');
    await expect(button).toContainText('Download');
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('does not autoplay and shows a still frame that is already zoomed in', async ({ page }) => {
    await page.goto('/');
    const view = demo(page);
    const button = page.getByRole('button', { name: 'Play demo' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(view).toHaveAttribute('data-playing', 'false');
    await expect.poll(() => scale(view)).toBe('2.00');
    const frozenAt = await time(view);
    await page.waitForTimeout(1200);
    expect(await time(view)).toBe(frozenAt);
    expect(await scale(view)).toBe('2.00');
  });

  test('the controls still work', async ({ page }) => {
    await page.goto('/');
    const view = demo(page);
    await expect.poll(() => scale(view)).toBe('2.00');

    await page.getByRole('switch', { name: 'Auto zoom' }).click();
    await expect.poll(() => scale(view)).toBe('1.00');
    await page.getByRole('switch', { name: 'Auto zoom' }).click();
    await expect.poll(() => scale(view)).toBe('2.00');

    const button = page.getByRole('button', { name: 'Play demo' });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(view).toHaveAttribute('data-playing', 'true');
    await expect.poll(() => time(view)).not.toBe(1900);
  });
});

test.describe('the download button names the visitor system', () => {
  const noClientHints = () => {
    // Safari and Firefox send no client hints, so only the user agent string is available. A real
    // desktop has no touch points, whatever screen this test machine has.
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  };
  const cases: [string, string, string][] = [
    [
      'Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Download for Windows',
    ],
    [
      'macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Download for macOS',
    ],
    [
      'Linux',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Download for Linux',
    ],
    [
      'an Android phone',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Download',
    ],
    [
      'an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Download',
    ],
  ];

  for (const [name, userAgent, label] of cases) {
    test(`for ${name}`, async ({ browser }) => {
      const context = await browser.newContext({ userAgent });
      const page = await context.newPage();
      await page.addInitScript(noClientHints);
      await page.goto('/');
      const button = page.locator('section a[data-download-trigger]').first();
      await expect(button.locator('span > span').first()).toContainText(label, {
        useInnerText: true,
      });
      await expect(button).toBeVisible();
      await context.close();
    });
  }

  test('an iPad asking for the desktop site gets the neutral button', async ({ browser }) => {
    const macUserAgent = cases[1]?.[1] ?? '';
    const context = await browser.newContext({ userAgent: macUserAgent });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    });
    await page.goto('/');
    await page.waitForTimeout(500);
    const label = page
      .locator('section a[data-download-trigger]')
      .first()
      .locator('span > span')
      .first();
    await expect(label).not.toContainText('for macOS');
    await context.close();
  });

  test('the button keeps its width when the label changes', async ({ browser }) => {
    const windows = cases[0]?.[1] ?? '';
    const widths: number[] = [];
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ userAgent: windows, javaScriptEnabled });
      const page = await context.newPage();
      await page.addInitScript(noClientHints);
      await page.goto('/');
      if (javaScriptEnabled) {
        await expect(
          page.locator('section a[data-download-trigger] span > span').first(),
        ).toContainText('Download for Windows');
      }
      const box = await page.locator('section a[data-download-trigger]').first().boundingBox();
      widths.push(box?.width ?? 0);
      await context.close();
    }
    expect(widths[0]).toBeGreaterThan(0);
    expect(Math.abs((widths[0] ?? 0) - (widths[1] ?? 0))).toBeLessThan(0.5);
  });
});
