import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Below this width the links collapse into a menu. */
const MENU_BREAKPOINT = 960;
const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 0) < MENU_BREAKPOINT;

const NAV_LABELS = ['Features', 'Use cases', 'Download', 'FAQ', 'Contribute'];

const backToTop = (page: Page) => page.getByRole('link', { name: 'Back to top' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('header and footer have no axe violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the menu open has no axe violations', async ({ page }) => {
  test.skip(!isNarrow(page), 'The menu button only exists on narrow screens.');
  await page.locator('summary').first().click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the page never scrolls sideways', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the header is a sticky black pill with square top corners and two ears', async ({ page }) => {
  const header = page.locator('body > header');
  const pill = header.locator('div').first();

  await expect(header).toHaveCSS('position', 'sticky');
  await expect(header).toHaveCSS('top', '0px');
  await expect(pill).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(pill).toHaveCSS('border-top-left-radius', '0px');
  await expect(pill).toHaveCSS('border-top-right-radius', '0px');
  await expect(pill).toHaveCSS('border-bottom-left-radius', '24px');
  await expect(pill).toHaveCSS('border-bottom-right-radius', '24px');

  for (const side of ['::before', '::after']) {
    const ear = await pill.evaluate((element, pseudo) => {
      const style = getComputedStyle(element, pseudo);
      return { width: style.width, height: style.height, image: style.backgroundImage };
    }, side);
    expect(ear.width).toBe('24px');
    expect(ear.height).toBe('24px');
    expect(ear.image).toContain('radial-gradient');
  }
});

test('the header stays at the top while the page scrolls', async ({ page }) => {
  await page.mouse.wheel(0, 1500);
  await page.waitForFunction(() => window.scrollY > 500);
  const top = await page
    .locator('header')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBe(0);
});

test('the header shrinks once the page scrolls and grows back at the top', async ({ page }) => {
  const header = page.locator('body > header');
  const pill = header.locator('div').first();
  const scaleOf = () =>
    pill.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Number(matrix.a.toFixed(2));
    });

  expect(await scaleOf()).toBe(1);
  const heightBefore = (await header.boundingBox())?.height ?? 0;

  await page.mouse.wheel(0, 600);
  await expect(page.locator('html')).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(scaleOf).toBeLessThan(1);
  await expect.poll(scaleOf).toBeGreaterThan(0.8);
  // A transform never changes layout, so nothing below the header moves.
  expect((await header.boundingBox())?.height ?? 0).toBe(heightBefore);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect(page.locator('html')).toHaveAttribute('data-scrolled', 'false');
  await expect.poll(scaleOf).toBe(1);
});

test('the pill stays one line high at every width, with no wrapped links', async ({ page }) => {
  for (const width of [360, 375, 768, 820, 900, 959, 960, 1024, 1100, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const pill = page.locator('body > header > div');
    const box = await pill.boundingBox();
    expect(box?.height ?? 999, `pill height at ${String(width)}px`).toBeLessThanOrEqual(64);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${String(width)}px`).toBeLessThanOrEqual(0);
    if (width >= MENU_BREAKPOINT) {
      const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
      for (const link of await links.all()) {
        const linkBox = await link.boundingBox();
        expect(linkBox?.height ?? 999, `link height at ${String(width)}px`).toBeLessThanOrEqual(40);
      }
    }
  }
});

test.describe('the Download button and the Support link in the header', () => {
  test('wide screens have the Download button in the pill and no Support in it', async ({
    page,
  }) => {
    test.skip(isNarrow(page), 'This is the wide layout.');
    const header = page.locator('body > header');
    const download = header.getByRole('link', { name: 'Download', exact: true });
    await expect(download.last()).toBeVisible();
    await expect(download.last().locator('svg')).toBeVisible();
    await expect(header.getByRole('link', { name: /Support/ })).toHaveCount(0);
  });

  test('narrow screens have the Download button in the pill and Support at the end of the menu', async ({
    page,
  }) => {
    test.skip(!isNarrow(page), 'This is the narrow layout.');
    const header = page.locator('body > header');
    await expect(header.getByRole('link', { name: 'Scrim home' })).toBeVisible();

    const download = header.getByRole('link', { name: 'Download', exact: true });
    await expect(download.first()).toBeVisible();
    await expect(download.first().locator('svg')).toBeVisible();

    // Support is not in the pill. It is the last item once the menu is open.
    await expect(header.getByRole('link', { name: /Support/ })).toHaveCount(0);
    await page.locator('summary').first().click();
    const items = page.getByRole('navigation', { name: 'Mobile' }).getByRole('link');
    await expect(items).toHaveText([...NAV_LABELS, 'Support (opens in a new tab)']);
    const support = items.last();
    await expect(support).toHaveAttribute('href', 'https://buymeamalt.com/@oyedokunken');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
    // The icon sits beside the word, in one row.
    const box = await support.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(70);
    const parts = await support.evaluate((element) => {
      const icon = element.querySelector('svg')?.getBoundingClientRect();
      const label = element.querySelector('span')?.getBoundingClientRect();
      return {
        iconTop: icon?.top ?? 0,
        labelTop: label?.top ?? 0,
        iconRight: icon?.right ?? 0,
        labelLeft: label?.left ?? 0,
      };
    });
    expect(parts.iconRight).toBeLessThanOrEqual(parts.labelLeft + 1);
    expect(Math.abs(parts.iconTop - parts.labelTop)).toBeLessThan(12);
  });

  test('the Support button in the menu is white, so it stands out', async ({ page }) => {
    test.skip(!isNarrow(page), 'The menu only exists on narrow screens.');
    await page.locator('summary').first().click();
    const support = page
      .getByRole('navigation', { name: 'Mobile' })
      .getByRole('link', { name: /Support/ });
    await expect(support).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('the narrow header has room between the logo, the Download button and the menu', async ({
    page,
  }) => {
    test.skip(!isNarrow(page), 'This is the narrow layout.');
    const header = page.locator('body > header');
    const logo = await header.getByRole('link', { name: 'Scrim home' }).boundingBox();
    const download = await header
      .getByRole('link', { name: 'Download', exact: true })
      .first()
      .boundingBox();
    const menu = await page.locator('summary').first().boundingBox();
    const gapOne = (download?.x ?? 0) - ((logo?.x ?? 0) + (logo?.width ?? 0));
    const gapTwo = (menu?.x ?? 0) - ((download?.x ?? 0) + (download?.width ?? 0));
    expect(gapOne).toBeGreaterThanOrEqual(12);
    expect(gapTwo).toBeGreaterThanOrEqual(12);
  });
});

test('wide screens show the links and narrow screens show a menu button', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const menu = page.locator('summary').first();
  if (isNarrow(page)) {
    await expect(nav).toBeHidden();
    await expect(menu).toBeAttached();
  } else {
    await expect(nav.getByRole('link')).toHaveText(NAV_LABELS);
    await expect(menu).toBeHidden();
  }
});

test('the whole header is reachable by keyboard', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Scrim home' })).toBeFocused();

  if (isNarrow(page)) {
    await page.keyboard.press('Tab');
    await expect(
      page.locator('body > header').getByRole('link', { name: 'Download', exact: true }).first(),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    const summary = page.locator('summary').first();
    await expect(summary).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('details').first()).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('navigation', { name: 'Mobile' }).getByRole('link').first(),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('details').first()).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
  } else {
    for (const name of NAV_LABELS) {
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name }),
      ).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(
      page.locator('body > header').getByRole('link', { name: 'Download', exact: true }).last(),
    ).toBeFocused();
  }
});

test('following a menu link closes the menu', async ({ page }) => {
  test.skip(!isNarrow(page), 'The menu button only exists on narrow screens.');
  await page.locator('summary').first().click();
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'FAQ' }).click();
  await expect(page.locator('details').first()).not.toHaveAttribute('open', '');
});

test.describe('the floating back to top button', () => {
  test('is hidden at the top of the page and cannot be tabbed to', async ({ page }) => {
    await expect(backToTop(page)).toBeHidden();
    const focusable = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('a[aria-label="Back to top"]');
      link?.focus();
      return document.activeElement === link;
    });
    expect(focusable).toBe(false);
  });

  test('appears once the page scrolls, floating in the corner and red like a record button', async ({
    page,
  }) => {
    await page.mouse.wheel(0, 1500);
    await expect(backToTop(page)).toBeVisible();
    await expect(backToTop(page)).toHaveCSS('position', 'fixed');

    const box = await backToTop(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
    // It sits in the lower right corner, not mid screen.
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan((viewport?.width ?? 0) - 40);

    await expect(backToTop(page).locator('span').last()).toHaveCSS(
      'background-color',
      'rgb(255, 59, 48)',
    );
  });

  test('stays in view as the page keeps scrolling and takes you back to the top', async ({
    page,
  }) => {
    await page.mouse.wheel(0, 3000);
    await page.waitForFunction(() => window.scrollY > 1500);
    await expect(backToTop(page)).toBeVisible();
    await backToTop(page).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    await expect(backToTop(page)).toBeHidden();
  });

  test('has no axe violations while it is showing', async ({ page }) => {
    await page.mouse.wheel(0, 1500);
    await expect(backToTop(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('footer', () => {
  test('has the brand block, three link columns and the legal row', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Scrim').first()).toBeVisible();
    for (const title of ['Product', 'Project', 'Trust']) {
      await expect(footer.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(footer.getByText(`© ${String(new Date().getFullYear())} Scrim.`)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'MIT license' }).last()).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Oyedokun Kehinde' })).toHaveAttribute(
      'href',
      'https://www.oyedokun.dev/',
    );
    await expect(footer.getByRole('link', { name: /^Show your Support/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  test('no longer shows the system chips, the version chip, the trust line or a back to top link', async ({
    page,
  }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Coming soon')).toHaveCount(0);
    await expect(footer.getByText('Latest version')).toHaveCount(0);
    await expect(footer.getByText('Recordings never leave your computer.')).toHaveCount(0);
    await expect(footer.getByRole('list', { name: 'Supported systems' })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'Back to top' })).toHaveCount(0);
  });

  test('the giant wordmark is decoration only, clipped by the bottom edge', async ({ page }) => {
    const mark = page
      .locator('footer [aria-hidden="true"]')
      .filter({ has: page.locator('svg text') });
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveCSS('overflow', 'hidden');
    const box = await mark.boundingBox();
    const svg = await mark.locator('svg').boundingBox();
    expect(box).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(svg?.height ?? 0).toBeGreaterThan(box?.height ?? 0);
  });

  test('links have a visible butter focus outline on the dark background', async ({ page }) => {
    const link = page.locator('footer').getByRole('link', { name: 'Privacy policy' });
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('outline-style', 'solid');
    await expect(link).toHaveCSS('outline-color', 'rgb(251, 248, 244)');
  });
});

test.describe('the back to top button is a recording', () => {
  const timer = (page: Page) => backToTop(page).locator('span').last();
  const progress = (page: Page) =>
    backToTop(page).evaluate((element) => Number(element.style.getPropertyValue('--p')));

  test('shows a time that counts up as the page scrolls', async ({ page }) => {
    await expect(timer(page)).toHaveText('00:00');
    await page.evaluate(() => {
      window.scrollTo(0, 800);
    });
    await expect(timer(page)).toHaveText('00:08');
    await page.evaluate(() => {
      window.scrollTo(0, 1250);
    });
    await expect(timer(page)).toHaveText('00:12');
  });

  test('the red ring fills as the page scrolls and is full at the bottom', async ({ page }) => {
    expect(await progress(page)).toBe(0);
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
    });
    await expect.poll(() => progress(page)).toBeGreaterThan(0);
    const partway = await progress(page);
    expect(partway).toBeLessThan(1);

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => progress(page)).toBeGreaterThan(0.99);
    // The ring is drawn in the record red.
    await expect(backToTop(page).locator('circle').last()).toHaveCSS('stroke', 'rgb(255, 59, 48)');
  });

  test('the time and the ring go back to the start at the top', async ({ page }) => {
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    await expect(timer(page)).toHaveText('00:20');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(timer(page)).toHaveText('00:00');
    expect(await progress(page)).toBe(0);
  });
});

test.describe('the Built by popover', () => {
  test('shows the five icons in one row, green until hovered, then black', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('body > footer');
    await footer.getByRole('button', { name: '@oyedokunken' }).click();
    const icons = footer.locator('[role="group"] a');
    await expect(icons).toHaveCount(5);

    const boxes = await icons.evaluateAll((links) =>
      links.map((link) => {
        const box = link.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          left: Math.round(box.left),
          right: Math.round(box.right),
        };
      }),
    );
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    boxes.slice(1).forEach((box, index) => {
      expect(box.left).toBeGreaterThanOrEqual(boxes[index]?.right ?? 0);
    });
    const viewport = page.viewportSize()?.width ?? 0;
    expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(viewport);

    const first = icons.first();
    await expect(first).toHaveCSS('color', 'rgb(0, 78, 82)');
    await first.hover();
    await expect(first).toHaveCSS('color', 'rgb(0, 0, 0)');
    await page.screenshot({ path: 'test-results/screenshots/popover.png' });
  });

  test('centers the two legal lines on a phone', async ({ page }) => {
    test.skip(!isNarrow(page) || (page.viewportSize()?.width ?? 0) > 640, 'Phones only.');
    await page.goto('/');
    const lines = page.locator('body > footer p', { hasText: 'All rights reserved' });
    await expect(lines).toHaveCSS('text-align', 'center');
  });
});
