import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Below this width the links collapse into a menu. */
const MENU_BREAKPOINT = 960;
const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 0) < MENU_BREAKPOINT;

const NAV: [string, string][] = [
  ['Features', 'features'],
  ['Use cases', 'use-cases'],
  ['Download', 'download'],
  ['FAQ', 'faq'],
  ['Contribute', 'contribute'],
];

const COMMANDS = [
  'git clone https://github.com/oyedokunken/scrim.git',
  'cd scrim',
  'pnpm install',
  'pnpm dev',
].join('\n');

async function openMenuIfNarrow(page: Page): Promise<void> {
  if (isNarrow(page)) {
    await page.locator('summary').first().click();
  }
}

function navLink(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: isNarrow(page) ? 'Mobile' : 'Primary' })
    .getByRole('link', { name: label });
}

/** Waits for smooth scrolling and content-visibility layout to settle. */
async function settled(page: Page): Promise<void> {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => Math.round(window.scrollY));
        const stable = now === previous;
        previous = now;
        return stable;
      },
      { timeout: 10_000, intervals: [200] },
    )
    .toBe(true);
}

test.describe('the nav lands on real sections', () => {
  for (const [label, id] of NAV) {
    test(`${label} lands on #${id}, fully below the pill`, async ({ page }) => {
      await page.goto('/');
      await openMenuIfNarrow(page);
      await navLink(page, label).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await settled(page);

      const section = await page.locator(`#${id}`).boundingBox();
      const heading = await page.locator(`#${id} h2`).first().boundingBox();
      const pill = await page.locator('header > div').boundingBox();
      const viewport = page.viewportSize()?.height ?? 0;
      expect(section).not.toBeNull();
      expect(heading).not.toBeNull();
      expect(pill).not.toBeNull();
      const pillBottom = (pill?.y ?? 0) + (pill?.height ?? 0);
      expect(section?.y ?? -1, 'section top').toBeGreaterThanOrEqual(pillBottom - 1);
      expect(heading?.y ?? -1, 'heading top').toBeGreaterThanOrEqual(pillBottom - 1);
      expect(heading?.y ?? 9999, 'heading is on screen').toBeLessThan(viewport);
    });
  }

  test('the footer links to the sections and to Contact land too', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Contact' }).click();
    await expect(page).toHaveURL(/#contact$/);
    await settled(page);
    const heading = await page.locator('#contact h2').boundingBox();
    const pill = await page.locator('header > div').boundingBox();
    expect(heading?.y ?? -1).toBeGreaterThanOrEqual((pill?.y ?? 0) + (pill?.height ?? 0) - 1);
  });
});

test.describe('accessibility', () => {
  for (const path of ['/', '/privacy']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`${path} never scrolls sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('the page has no axe violations with every disclosure open', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach((element) => {
        element.open = true;
      });
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('the disclosures', () => {
  test('each system has first run help that opens on click', async ({ page }) => {
    await page.goto('/');
    const download = page.locator('#download');
    const summaries = download.getByText('First run help');
    await expect(summaries).toHaveCount(3);
    for (const [index, text] of ['SmartScreen', 'Open Anyway', 'X11'].entries()) {
      await summaries.nth(index).click();
      await expect(download.locator('details').nth(index)).toHaveAttribute('open', '');
      await expect(download.locator('details').nth(index)).toContainText(text);
    }
  });

  test('the FAQ opens and closes from the keyboard', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('#faq details').first();
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('open', '');
    await expect(first).toContainText('free and open source');
    await page.keyboard.press('Space');
    await expect(first).not.toHaveAttribute('open', '');
  });

  test('the FAQ is two columns of six on wide screens and one column on narrow ones', async ({
    page,
  }) => {
    await page.goto('/');
    const items = page.locator('#faq details');
    await expect(items).toHaveCount(12);
    const left = await items.nth(0).boundingBox();
    const right = await items.nth(6).boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    if ((page.viewportSize()?.width ?? 0) >= 900) {
      expect(Math.abs((left?.y ?? 0) - (right?.y ?? 99))).toBeLessThan(2);
      expect(right?.x ?? 0).toBeGreaterThan((left?.x ?? 0) + (left?.width ?? 0) - 1);
    } else {
      expect(Math.abs((left?.x ?? 0) - (right?.x ?? 99))).toBeLessThan(2);
    }
  });
});

test.describe('the copy button', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copies the commands and says so', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are set up for Chromium.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Copy commands' });
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(COMMANDS);
  });
});

test.describe('the copy button with the clipboard blocked', () => {
  test('selects the commands instead and tells the visitor', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
        configurable: true,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Copy commands' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Selected' })).toBeVisible();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected).toBe(COMMANDS);
  });
});

test.describe('keyboard only', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('the whole page can be walked with Tab, Enter and Space', async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    const seen = new Set<string>();
    let openedFaq = false;
    let openedHelp = false;
    let copied = false;

    for (let step = 0; step < 220; step += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) {
          return null;
        }
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label: (element.getAttribute('aria-label') ?? element.textContent).trim().slice(0, 60),
          inFaq: element.closest('#faq') !== null,
          inDownload: element.closest('#download') !== null,
          outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
          size: rect.width > 0 && rect.height > 0,
        };
      });

      expect(info, `focus must stay on a real element at step ${String(step)}`).not.toBeNull();
      if (info === null) {
        break;
      }
      seen.add(info.label);
      expect(info.size, `${info.label} is focusable but has no size`).toBe(true);
      expect(info.outline, `${info.label} shows no focus outline`).toBe(true);

      if (info.tag === 'summary' && info.inFaq && !openedFaq) {
        await page.keyboard.press('Enter');
        await expect(page.locator('#faq details[open]')).toHaveCount(1);
        openedFaq = true;
      }
      if (info.tag === 'summary' && info.inDownload && !openedHelp) {
        await page.keyboard.press('Space');
        await expect(page.locator('#download details[open]')).toHaveCount(1);
        openedHelp = true;
      }
      if (info.label === 'Copy commands' && !copied) {
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
        if (browserName === 'chromium') {
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(COMMANDS);
        }
        copied = true;
      }
      if (info.label === 'Back to top') {
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
        break;
      }
    }

    expect(openedFaq, 'a FAQ question was opened by keyboard').toBe(true);
    expect(openedHelp, 'first run help was opened by keyboard').toBe(true);
    expect(copied, 'the commands were copied by keyboard').toBe(true);
    for (const expected of [
      'Play demo',
      'Auto zoom',
      'Copy commands',
      'Back to top',
      'Privacy policy',
    ]) {
      expect(
        [...seen].some((label) => label.includes(expected)),
        `${expected} was reachable`,
      ).toBe(true);
    }
  });
});

test.describe('metadata and structured data', () => {
  for (const [path, title] of [
    ['/', 'Scrim | Record and capture anything on your screen effortlessly'],
    ['/privacy', 'Privacy policy | Scrim'],
  ] as const) {
    test(`${path} has the Open Graph, Twitter and canonical tags`, async ({ page, request }) => {
      await page.goto(path);
      const meta = (selector: string) => page.locator(selector).first().getAttribute('content');
      await expect(page).toHaveTitle(title);
      expect(await meta('meta[property="og:title"]')).toBe(title);
      expect(await meta('meta[property="og:description"]')).toBeTruthy();
      expect(await meta('meta[property="og:image:width"]')).toBe('1200');
      expect(await meta('meta[property="og:image:height"]')).toBe('630');
      expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
      expect(await meta('meta[name="twitter:image"]')).toBeTruthy();
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBeTruthy();

      // The image answers with a real PNG of the size the tags promise.
      const image = await meta('meta[property="og:image"]');
      const url = new URL(image ?? '');
      const response = await request.get(`${url.pathname}${url.search}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      const bytes = await response.body();
      expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(1200);
      expect(bytes.readUInt32BE(20)).toBe(630);
    });
  }

  test('the home page carries SoftwareApplication structured data', async ({ page }) => {
    await page.goto('/');
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('Scrim');
    expect(data.operatingSystem).toBe('Windows, macOS, Linux');
    expect(data.applicationCategory).toBe('MultimediaApplication');
    expect(data.offers).toMatchObject({ price: '0' });
    expect(data.license).toBe('https://github.com/oyedokunken/scrim/blob/main/LICENSE');
    expect(raw ?? '').not.toContain('<');
  });
});

test.describe('the look', () => {
  test('uses the owner palette: butter page, black header and footer, green band', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 248, 244)');
    await expect(page.locator('header > div')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('footer')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('#download')).toHaveCSS('background-color', 'rgb(0, 78, 82)');
  });

  test('loads nothing from any other origin', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? '').origin;
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) {
        foreign.push(url);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });

  test('sets no cookies', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await context.cookies()).toEqual([]);
  });
});

test.describe('no stray scrollbars', () => {
  test('nothing on the page scrolls on its own, so no browser scrollbar shows inside a section', async ({
    page,
  }) => {
    await page.goto('/');
    const scrollers = await page.evaluate(() => {
      const found: string[] = [];
      document.querySelectorAll('body *').forEach((element) => {
        const style = getComputedStyle(element);
        const scrolls =
          ['auto', 'scroll'].includes(style.overflowX) ||
          ['auto', 'scroll'].includes(style.overflowY);
        if (scrolls) {
          found.push(element.tagName.toLowerCase() + '.' + element.className);
        }
      });
      return found;
    });
    expect(scrollers).toEqual([]);
  });

  test('the command block wraps instead of scrolling', async ({ page }) => {
    await page.goto('/');
    const code = page.locator('#contribute pre');
    await code.scrollIntoViewIfNeeded();
    const fits = await code.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(fits).toBe(true);
  });
});

test.describe('the content the owner asked for', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the FAQ heading and subtext line up with each other', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'You probably have questions.' })).toBeVisible();
    await expect(page.getByText('Straight answers, before you download.')).toBeVisible();
  });

  test('the FAQ answers the sign up and cloud questions', async ({ page }) => {
    const faq = page.locator('#faq');
    await expect(faq.getByText('Do I need to sign up?')).toBeVisible();
    await expect(faq.getByText('Are my videos saved to the cloud?')).toBeVisible();
  });

  test('the sections that were removed are gone', async ({ page }) => {
    await expect(page.locator('#about')).toHaveCount(0);
    await expect(page.getByText('Project status')).toHaveCount(0);
    await expect(page.getByText('The desktop app is in development')).toHaveCount(0);
    await expect(page.getByText('Screen recorders should not make you sign in')).toHaveCount(0);
  });

  test('Contribute shows how to run the app, not the website', async ({ page }) => {
    const contribute = page.locator('#contribute');
    await expect(contribute.getByText('Run it locally')).toBeVisible();
    await expect(contribute.locator('pre')).toHaveText(COMMANDS);
    await expect(contribute.getByText('pnpm dev:landing')).toHaveCount(0);
  });

  test('the nav has no About link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveCount(0);
  });
});
