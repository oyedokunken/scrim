import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

const RELEASES = 'https://github.com/oyedokunken/scrim/releases';
const MALT = 'https://buymeamalt.com/@oyedokunken';

const USER_AGENTS = {
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
} as const;

const heroButton = (page: Page) =>
  page.locator('section[aria-labelledby="hero-title"] a[data-download-trigger]');
const dialog = (page: Page) => page.getByRole('dialog');

interface Reply {
  status?: number;
  body?: Record<string, unknown>;
}

/** Stands in for the API and for the installer, so no test writes to the real database. */
async function mockServer(page: Page, baseURL: string, reply: Reply = {}) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/downloads', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: reply.status ?? 200,
      json: reply.body ?? {
        url: `${baseURL}/fake-installer.exe`,
        filename: 'Scrim-1.0.0-x64.exe',
        version: '1.0.0',
        direct: true,
      },
    });
  });
  await page.route('**/fake-installer.exe', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="Scrim-1.0.0-x64.exe"',
      },
      body: 'installer',
    });
  });
  return requests;
}

/** A visitor on a given system. Safari and Firefox send no client hints, so only the string counts. */
async function visitorOn(browser: Browser, system: keyof typeof USER_AGENTS): Promise<Page> {
  const context = await browser.newContext({ userAgent: USER_AGENTS[system] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  });
  return page;
}

/**
 * Picks Windows when the dialog has not chosen a system. A desktop browser gets its system picked
 * from the computer, but a touch screen is treated as a phone, which gets no guess, so the visitor
 * has to choose.
 */
async function chooseSystemIfNone(page: Page, viaKeyboard = false) {
  const checked = dialog(page).getByRole('radio', { checked: true });
  if ((await checked.count()) > 0) {
    return;
  }
  const windows = dialog(page).getByRole('radio', { name: 'Windows' });
  if (viaKeyboard) {
    await windows.focus();
    await page.keyboard.press('Space');
  } else {
    await windows.check();
  }
}

async function fillIn(
  page: Page,
  name = 'Ada Lovelace',
  email = 'ada@example.com',
  { pickSystem = true }: { pickSystem?: boolean } = {},
) {
  await dialog(page).getByLabel('Your name').fill(name);
  await dialog(page).getByLabel('Your email').fill(email);
  if (pickSystem) {
    await chooseSystemIfNone(page);
  }
}

async function openDialog(page: Page) {
  await page.goto('/');
  await heroButton(page).click();
  await expect(dialog(page)).toBeVisible();
  // The dialog rises in. Wait for that to finish, so positions are measured on the settled dialog.
  await dialog(page).evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
}

test.describe('opening the download dialog', () => {
  test('the hero button opens it, with the heading, the reason and focus on the name', async ({
    page,
  }) => {
    await openDialog(page);
    await expect(dialog(page).getByRole('heading', { name: 'Before you download' })).toBeVisible();
    await expect(dialog(page).getByText(/We track the number of downloads/)).toBeVisible();
    await expect(dialog(page).getByText(/get to know you/)).toBeVisible();
    await expect(dialog(page).getByLabel('Your name')).toBeFocused();
  });

  test('the header Download button opens it too', async ({ page }) => {
    await page.goto('/');
    await page
      .locator('body > header')
      .getByRole('link', { name: 'Download', exact: true })
      .last()
      .click();
    await expect(dialog(page)).toBeVisible();
  });

  test('the Windows card opens it with Windows chosen', async ({ page }) => {
    await page.goto('/');
    await page.locator('#download').getByRole('link', { name: 'Download for Windows' }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('radio', { name: 'Windows' })).toBeChecked();
    await expect(dialog(page).getByRole('heading', { name: 'Before you download' })).toBeVisible();
  });

  test('a card for a system with no installer opens it as a Coming soon sign up', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#download').getByText('Coming soon')).toHaveCount(2);
    await expect(page.locator('#download').getByText('Download for macOS')).toHaveCount(0);
    await page
      .locator('#download')
      .getByRole('link', { name: 'Email me when it is ready' })
      .first()
      .click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: /is coming soon/ })).toBeVisible();
    await expect(dialog(page).getByLabel('Email me when a new version is out')).toHaveCount(0);
    await expect(
      dialog(page).getByRole('button', { name: 'Tell me when it is ready' }),
    ).toBeVisible();
  });

  test('the closing call to action opens it with that system chosen', async ({ page }) => {
    await page.goto('/');
    await page
      .locator('section[aria-labelledby="cta-title"]')
      .getByRole('link', { name: 'Linux' })
      .click();
    await expect(dialog(page).getByRole('radio', { name: 'Linux' })).toBeChecked();
  });

  test('a click with a modifier key still opens the Releases page the usual way', async ({
    page,
  }) => {
    await page.goto('/');
    const link = heroButton(page);
    await expect(link).toHaveAttribute('href', RELEASES);
    await link.click({ modifiers: ['Shift'] }).catch(() => undefined);
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe('the system is picked from the visitor computer', () => {
  for (const [system, label] of [
    ['windows', 'Windows'],
    ['macos', 'macOS'],
    ['linux', 'Linux'],
  ] as const) {
    test(`for ${label}`, async ({ browser }) => {
      const page = await visitorOn(browser, system);
      await openDialog(page);
      await expect(dialog(page).getByRole('radio', { name: label })).toBeChecked();
      await expect(dialog(page).getByText(`We picked ${label} from your computer.`)).toBeVisible();
      await page.context().close();
    });
  }

  test('a Mac or Linux visitor is told it is coming soon, and is not asked about chips or packages', async ({
    browser,
  }) => {
    for (const system of ['macos', 'linux'] as const) {
      const page = await visitorOn(browser, system);
      await openDialog(page);
      await expect(dialog(page).getByRole('heading', { name: /is coming soon/ })).toBeVisible();
      await expect(dialog(page).getByText('Which Mac?')).toHaveCount(0);
      await expect(dialog(page).getByText('Which package?')).toHaveCount(0);
      await page.context().close();
    }
  });

  test('the visitor can change it, and the choice sticks', async ({ browser }) => {
    const page = await visitorOn(browser, 'windows');
    await openDialog(page);
    await dialog(page).getByRole('radio', { name: 'Linux' }).check();
    await expect(dialog(page).getByRole('radio', { name: 'Linux' })).toBeChecked();
    await expect(dialog(page).getByRole('radio', { name: 'Windows' })).not.toBeChecked();
    await expect(dialog(page).getByText(/We picked Windows/)).toHaveCount(0);
    await page.context().close();
  });

  test('a phone is told what Scrim runs on and picks nothing for them', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    });
    await openDialog(page);
    await expect(
      dialog(page)
        .getByText(/Windows has an installer today. macOS and Linux are coming soon/)
        .first(),
    ).toBeVisible();
    for (const label of ['Windows', 'macOS', 'Linux']) {
      await expect(dialog(page).getByRole('radio', { name: label })).not.toBeChecked();
    }
    await context.close();
  });
});

test.describe('the form', () => {
  test('has placeholders on the name and the email', async ({ page }) => {
    await openDialog(page);
    await expect(dialog(page).getByLabel('Your name')).toHaveAttribute(
      'placeholder',
      'Ada Lovelace',
    );
    await expect(dialog(page).getByLabel('Your email')).toHaveAttribute(
      'placeholder',
      'you@example.com',
    );
  });

  test('puts the name and the email side by side at half the width each, and stacks them on a phone', async ({
    page,
  }) => {
    await openDialog(page);
    const name = await dialog(page).getByLabel('Your name').boundingBox();
    const email = await dialog(page).getByLabel('Your email').boundingBox();
    expect(name).not.toBeNull();
    expect(email).not.toBeNull();
    if ((page.viewportSize()?.width ?? 0) >= 640) {
      expect(Math.abs((name?.y ?? 0) - (email?.y ?? 99))).toBeLessThan(2);
      expect(Math.abs((name?.width ?? 0) - (email?.width ?? 0))).toBeLessThan(2);
      const row = await dialog(page).locator('form > div').first().boundingBox();
      expect((name?.width ?? 0) / (row?.width ?? 1)).toBeGreaterThan(0.44);
      expect((name?.width ?? 0) / (row?.width ?? 1)).toBeLessThan(0.51);
    } else {
      expect(Math.abs((name?.x ?? 0) - (email?.x ?? 99))).toBeLessThan(2);
      expect(email?.y ?? 0).toBeGreaterThan((name?.y ?? 0) + (name?.height ?? 0));
    }
  });

  test('uses no HTML required attributes', async ({ page }) => {
    await openDialog(page);
    await expect(dialog(page).locator('[required]')).toHaveCount(0);
    await expect(dialog(page).locator('form')).toHaveAttribute('novalidate', '');
  });

  test('prints an error under each empty field and sends nothing', async ({ page, baseURL }) => {
    const requests = await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();

    await expect(dialog(page).getByText('Enter your name.')).toBeVisible();
    await expect(dialog(page).getByText('Enter a valid email address.')).toBeVisible();
    await expect(dialog(page).getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog(page).getByLabel('Your email')).toHaveAttribute('aria-invalid', 'true');
    // The error is tied to its field for screen readers.
    await expect(dialog(page).getByLabel('Your name')).toHaveAttribute('aria-describedby', /.+/);
    await expect(dialog(page).getByLabel('Your name')).toBeFocused();
    expect(requests).toHaveLength(0);
  });

  test('prints an error for an email with no at sign, and clears it once it is fixed', async ({
    page,
    baseURL,
  }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page, 'Ada', 'ada.example.com');
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByText('Enter a valid email address.')).toBeVisible();
    await expect(dialog(page).getByText('Enter your name.')).toHaveCount(0);

    await dialog(page).getByLabel('Your email').fill('ada@example.com');
    await expect(dialog(page).getByText('Enter a valid email address.')).toHaveCount(0);
    await expect(dialog(page).getByLabel('Your email')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('refuses a name over 80 characters', async ({ page, baseURL }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await dialog(page)
      .getByLabel('Your name')
      .evaluate((input: HTMLInputElement) => {
        input.removeAttribute('maxlength');
      });
    await fillIn(page, 'a'.repeat(81));
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByText('Use 80 characters or fewer.')).toBeVisible();
  });

  test('asks for a system when none is picked, as on a phone', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    });
    const requests = await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page, 'Ada Lovelace', 'ada@example.com', { pickSystem: false });
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByText('Choose your system.')).toBeVisible();
    expect(requests).toHaveLength(0);
    await context.close();
  });

  test('has a honeypot that is out of sight and out of the tab order', async ({ page }) => {
    await openDialog(page);
    const trap = dialog(page).locator('input[name="website"]');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    const box = await trap.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(0);
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      await expect(trap).not.toBeFocused();
    }
  });

  test('leaves the release notices box unticked', async ({ page }) => {
    await openDialog(page);
    await expect(dialog(page).getByLabel('Email me when a new version is out')).not.toBeChecked();
  });
});

test.describe('starting the download', () => {
  test('sends the form, starts the file and shows the success view with Support', async ({
    page,
    baseURL,
  }) => {
    const requests = await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog(page).getByRole('button', { name: 'Start download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Scrim-1.0.0-x64.exe');

    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeVisible();
    await expect(dialog(page).getByText(/Thanks, Ada\./)).toBeVisible();
    await expect(
      dialog(page).getByText(/Scrim-1\.0\.0-x64\.exe \(version 1\.0\.0\)/),
    ).toBeVisible();
    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeFocused();

    const support = dialog(page).getByRole('link', { name: /Show your Support/ });
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute('href', MALT);
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      updatesOptIn: false,
      website: '',
    });
  });

  test('sends the system and the opt in the visitor chose', async ({ browser, baseURL }) => {
    const page = await visitorOn(browser, 'windows');
    const requests = await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page, '  Ada  ', '  ADA@Example.com ');
    await dialog(page).getByLabel('Email me when a new version is out').check();
    await Promise.all([
      page.waitForEvent('download'),
      dialog(page).getByRole('button', { name: 'Start download' }).click(),
    ]);
    expect(requests[0]).toMatchObject({
      name: 'Ada',
      email: 'ada@example.com',
      os: 'windows',
      arch: 'x64',
      updatesOptIn: true,
    });
    await page.context().close();
  });

  test('a Mac visitor signs up for news and sees the list message, with no download', async ({
    browser,
    baseURL,
  }) => {
    const page = await visitorOn(browser, 'macos');
    const requests = await mockServer(page, baseURL ?? '', {
      body: { url: RELEASES, filename: '', version: '', direct: false, comingSoon: true },
    });
    await openDialog(page);
    await fillIn(page, 'Ada', 'ada@example.com');
    await dialog(page).getByRole('button', { name: 'Tell me when it is ready' }).click();
    await expect(dialog(page).getByRole('heading', { name: 'You are on the list.' })).toBeVisible();
    expect(requests[0]).toMatchObject({ os: 'macos', updatesOptIn: true });
    await page.context().close();
  });

  test('shows the Support button on the success view even without a file to download', async ({
    page,
    baseURL,
  }) => {
    await mockServer(page, baseURL ?? '', {
      body: { url: RELEASES, filename: '', version: '', direct: false },
    });
    await page
      .context()
      .route('https://github.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<p>releases</p>' }),
      );
    await openDialog(page);
    await fillIn(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeVisible();
    await expect(dialog(page).getByText(/published on the Releases page/)).toBeVisible();
    await expect(
      dialog(page).getByRole('link', { name: /Open the Releases page/ }),
    ).toHaveAttribute('href', RELEASES);
    await expect(dialog(page).getByRole('link', { name: /Show your Support/ })).toBeVisible();
  });

  test('closing the success view returns focus to the button that opened the dialog', async ({
    page,
    baseURL,
  }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page);
    await Promise.all([
      page.waitForEvent('download'),
      dialog(page).getByRole('button', { name: 'Start download' }).click(),
    ]);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog(page)).toBeHidden();
    await expect(heroButton(page)).toBeFocused();
  });

  test('reopening starts with an empty form', async ({ page, baseURL }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page, 'Ada', 'ada@example.com');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await heroButton(page).click();
    await expect(dialog(page).getByLabel('Your name')).toHaveValue('');
    await expect(dialog(page).getByLabel('Your email')).toHaveValue('');
  });
});

test.describe('when something goes wrong', () => {
  test('a rate limit is explained and the Releases page is still offered', async ({
    page,
    baseURL,
  }) => {
    await mockServer(page, baseURL ?? '', {
      status: 429,
      body: { error: 'Too many downloads from this network. Please try again in an hour.' },
    });
    await openDialog(page);
    await fillIn(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('try again in an hour');
    await expect(dialog(page).getByRole('alert').getByRole('link')).toHaveAttribute(
      'href',
      RELEASES,
    );
    await expect(dialog(page).getByRole('button', { name: 'Start download' })).toBeEnabled();
  });

  test('a message from the server about a field appears under that field', async ({
    page,
    baseURL,
  }) => {
    await mockServer(page, baseURL ?? '', {
      status: 400,
      body: {
        error: 'Check the form and try again.',
        fields: { email: 'That address is not accepted.' },
      },
    });
    await openDialog(page);
    await fillIn(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByText('That address is not accepted.')).toBeVisible();
    await expect(dialog(page).getByRole('alert')).toContainText('Check the form');
  });

  test('a network failure never blocks the download: the Releases page is offered', async ({
    page,
  }) => {
    await page.route('**/api/downloads', (route) => route.abort('failed'));
    await openDialog(page);
    await fillIn(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('You can still get Scrim');
    await expect(dialog(page).getByRole('alert').getByRole('link')).toHaveAttribute(
      'href',
      RELEASES,
    );
  });

  test('the button is disabled while the request is running', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/downloads', async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        json: { url: RELEASES, filename: '', version: '', direct: false },
      });
    });
    await page
      .context()
      .route('https://github.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<p>releases</p>' }),
      );
    await openDialog(page);
    await fillIn(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(
      dialog(page).getByRole('button', { name: /Starting your download/ }),
    ).toBeDisabled();
    release();
    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeVisible();
  });
});

test.describe('keyboard and focus', () => {
  test('Escape closes the dialog and focus goes back to the button', async ({ page }) => {
    await openDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(heroButton(page)).toBeFocused();
  });

  test('a click on the backdrop closes it', async ({ page }) => {
    await openDialog(page);
    await page.mouse.click(4, 4);
    await expect(dialog(page)).toBeHidden();
  });

  test('the Close button closes it', async ({ page }) => {
    await openDialog(page);
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(dialog(page)).toBeHidden();
  });

  test('Tab never reaches the page behind the dialog', async ({ page }) => {
    await openDialog(page);
    // A modal dialog makes the page behind it inert. After its last control, the browser hands
    // focus to its own interface, which shows up here as the body, and that is not a trap. What
    // must never happen is focus landing on a control of the page underneath.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          return 'browser';
        }
        return active.closest('dialog') === null ? 'page behind' : 'dialog';
      });
      expect(where, `Tab ${String(i + 1)} reached the page behind the dialog`).not.toBe(
        'page behind',
      );
    }
  });

  test('the whole form can be done with the keyboard alone', async ({ page, baseURL }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await page.keyboard.type('Ada Lovelace');
    await page.keyboard.press('Tab');
    await page.keyboard.type('ada@example.com');
    await expect(dialog(page).getByLabel('Your name')).toHaveValue('Ada Lovelace');
    await expect(dialog(page).getByLabel('Your email')).toHaveValue('ada@example.com');
    await chooseSystemIfNone(page, true);

    const submit = dialog(page).getByRole('button', { name: 'Start download' });
    await submit.focus();
    await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeVisible();
  });

  test('the page behind the dialog does not scroll', async ({ page }) => {
    await openDialog(page);
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
  });
});

test.describe('accessibility of the dialog', () => {
  test('the form has no axe violations', async ({ page }) => {
    await openDialog(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the form with errors showing has no axe violations', async ({ page }) => {
    await openDialog(page);
    await dialog(page).getByRole('button', { name: 'Start download' }).click();
    await expect(dialog(page).getByText('Enter your name.')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the success view has no axe violations', async ({ page, baseURL }) => {
    await mockServer(page, baseURL ?? '');
    await openDialog(page);
    await fillIn(page);
    await Promise.all([
      page.waitForEvent('download'),
      dialog(page).getByRole('button', { name: 'Start download' }).click(),
    ]);
    await expect(
      dialog(page).getByRole('heading', { name: 'Your download is starting.' }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the dialog never scrolls the page sideways', async ({ page }) => {
    await openDialog(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('the unsubscribe page', () => {
  const TOKEN = '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11';

  test('does nothing when it is only opened, because mail scanners open every link', async ({
    page,
  }) => {
    const calls: string[] = [];
    await page.route('**/api/unsubscribe', async (route) => {
      calls.push(route.request().method());
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto(`/unsubscribe?token=${TOKEN}`);
    await expect(
      page.getByRole('heading', { name: 'Unsubscribe from release notices' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(calls).toEqual([]);
  });

  test('unsubscribes once, with a POST, when the button is pressed', async ({ page }) => {
    const calls: { method: string; body: unknown }[] = [];
    await page.route('**/api/unsubscribe', async (route) => {
      calls.push({
        method: route.request().method(),
        body: route.request().postDataJSON() as unknown,
      });
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto(`/unsubscribe?token=${TOKEN}`);
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.getByRole('status')).toContainText('You are unsubscribed.');
    expect(calls).toEqual([{ method: 'POST', body: { token: TOKEN } }]);
  });

  test('says what went wrong and lets the visitor try again', async ({ page }) => {
    await page.route('**/api/unsubscribe', (route) =>
      route.fulfill({ status: 500, json: { error: 'no' } }),
    );
    await page.goto(`/unsubscribe?token=${TOKEN}`);
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    // Next.js adds its own route announcer with the same role, so pick the page's message.
    await expect(page.getByRole('alert').filter({ hasText: 'did not work' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled();
  });

  test('explains a link with no valid token and shows no button', async ({ page }) => {
    await page.goto('/unsubscribe?token=nope');
    await expect(page.getByText(/not complete/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toHaveCount(0);
    await page.goto('/unsubscribe');
    await expect(page.getByText(/not complete/)).toBeVisible();
  });

  test('is kept out of search results and has no axe violations', async ({ page }) => {
    await page.goto(`/unsubscribe?token=${TOKEN}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no GET endpoint that could unsubscribe someone', async ({ request }) => {
    const response = await request.get('/api/unsubscribe');
    expect(response.status()).toBe(405);
  });
});

test.describe('the download API', () => {
  test('refuses a request that does not come from the site', async ({ request }) => {
    const response = await request.post('/api/downloads', {
      headers: { origin: 'https://evil.example' },
      data: { name: 'Eve', email: 'eve@example.com', os: 'windows' },
    });
    expect(response.status()).toBe(403);
  });

  test('refuses a bad form with a message for each field', async ({ request, baseURL }) => {
    const response = await request.post('/api/downloads', {
      headers: { origin: baseURL ?? '' },
      data: { name: '', email: 'nope', os: 'windows' },
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(['email', 'name']);
  });

  test('has no GET endpoint', async ({ request }) => {
    expect((await request.get('/api/downloads')).status()).toBe(405);
  });
});
