import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('header and footer have no axe violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the menu open has no axe violations', async ({ page }) => {
  test.skip(!isNarrow(page), 'The menu button only exists on narrow screens.');
  await page.locator('summary').click();
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
  const header = page.locator('header');
  const pill = header.locator('div').first();

  await expect(header).toHaveCSS('position', 'sticky');
  await expect(header).toHaveCSS('top', '0px');
  await expect(pill).toHaveCSS('background-color', 'rgb(44, 35, 34)');
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
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
  });
  await page.mouse.wheel(0, 1500);
  await page.waitForFunction(() => window.scrollY > 500);
  const top = await page
    .locator('header')
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBe(0);
});

test('the pill stays one line high at every width, with no wrapped links', async ({ page }) => {
  for (const width of [360, 375, 759, 760, 768, 820, 900, 980, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const pill = page.locator('header > div');
    const box = await pill.boundingBox();
    expect(box?.height ?? 999, `pill height at ${String(width)}px`).toBeLessThanOrEqual(64);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${String(width)}px`).toBeLessThanOrEqual(0);
    const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
    if (width >= 760) {
      for (const link of await links.all()) {
        const linkBox = await link.boundingBox();
        expect(linkBox?.height ?? 999, `link height at ${String(width)}px`).toBeLessThanOrEqual(40);
      }
    }
  }
});

test('the pill reads Scrim and keeps Buy me suya visible', async ({ page }) => {
  const header = page.locator('header');
  await expect(header.getByRole('link', { name: 'Scrim home' })).toBeVisible();
  const suya = header.getByRole('link', { name: /^Buy me suya/ });
  await expect(suya).toBeVisible();
  await expect(suya.locator('span').first()).toHaveText('Buy me suya');
  await expect(suya).toHaveAttribute('href', 'https://buymeamalt.com/@oyedokunken');
  await expect(suya).toHaveAttribute('target', '_blank');
  await expect(suya).toHaveAttribute('rel', 'noopener noreferrer');
});

test('wide screens show the links and narrow screens show a menu button', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const menu = page.locator('summary');
  if (isNarrow(page)) {
    await expect(nav).toBeHidden();
    await expect(menu).toBeAttached();
  } else {
    await expect(nav.getByRole('link')).toHaveText([
      'Features',
      'Who it’s for',
      'Download',
      'About',
      'Contribute',
    ]);
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
    await expect(page.getByRole('link', { name: /^Buy me suya/ }).first()).toBeFocused();
    await page.keyboard.press('Tab');
    const summary = page.locator('summary');
    await expect(summary).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('details')).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('navigation', { name: 'Mobile' }).getByRole('link').first(),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('details')).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
  } else {
    for (const name of ['Features', 'Who it’s for', 'Download', 'About', 'Contribute']) {
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name }),
      ).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /^Buy me suya/ }).first()).toBeFocused();
  }
});

test('following a menu link closes the menu', async ({ page }) => {
  test.skip(!isNarrow(page), 'The menu button only exists on narrow screens.');
  await page.locator('summary').click();
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await page
    .getByRole('navigation', { name: 'Mobile' })
    .getByRole('link', { name: 'About' })
    .click();
  await expect(page.locator('details')).not.toHaveAttribute('open', '');
});

test.describe('footer', () => {
  test('has the brand block, three link columns, the trust line and the legal row', async ({
    page,
  }) => {
    const footer = page.locator('footer');
    await expect(
      footer.getByRole('link', { name: 'Scrim' }).or(footer.getByText('Scrim').first()),
    ).toBeVisible();
    for (const system of ['Windows', 'macOS', 'Linux']) {
      await expect(
        footer.getByRole('list', { name: 'Supported systems' }).getByText(system),
      ).toBeVisible();
    }
    for (const title of ['Product', 'Project', 'Trust']) {
      await expect(footer.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(footer.getByText('Recordings never leave your computer.')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Back to top' })).toBeVisible();
    await expect(footer.getByText(`© ${new Date().getFullYear()} Scrim.`)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'MIT license' }).last()).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Oyedokun Kehinde' })).toHaveAttribute(
      'href',
      'https://www.oyedokun.dev/',
    );
    await expect(footer.getByRole('link', { name: /^Buy me suya/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  test('shows Coming soon and links to the releases page when there is no release', async ({
    page,
  }) => {
    const chip = page.locator('footer a', { hasText: /Coming soon|Latest version/ });
    await expect(chip).toHaveAttribute('href', 'https://github.com/oyedokunken/scrim/releases');
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
    await expect(link).toHaveCSS('outline-color', 'rgb(251, 247, 244)');
  });
});
