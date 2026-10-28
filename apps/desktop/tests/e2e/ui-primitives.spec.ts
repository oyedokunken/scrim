import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Records every CSP violation, so a style attribute or an injected style tag fails the test. */
async function watchViolations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store: string[] = [];
    (globalThis as unknown as { __violations: string[] }).__violations = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => (globalThis as unknown as { __violations: string[] }).__violations);
}

test.describe('the welcome screen', () => {
  test('shows no focus ring on load and pins the credit and the button to the corners', async ({
    page,
  }) => {
    const button = page.getByRole('button', { name: /get started|continue/i });
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => document.querySelector(':focus-visible') !== null)).toBe(
      false,
    );
    expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');

    const box = async (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom };
        });
    const top = await box('.welcome-top');
    const credit = await box('.welcome-credit');
    const action = await box('.welcome-button');
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }));

    // The credit sits at the left margin of the top block and the button at the same margin on the right.
    expect(Math.abs(credit.left - top.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(size.width - action.right - top.left)).toBeLessThanOrEqual(1);
    // Both sit at the same distance from the bottom as the block is from the top.
    expect(Math.abs(size.height - action.bottom - top.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(size.height - credit.bottom - top.top)).toBeLessThanOrEqual(1);
  });

  test('Enter continues without the button having focus', async ({ page }) => {
    await expect(page.getByRole('button', { name: /get started|continue/i })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Record', level: 1 })).toBeVisible();
  });
});

test.describe('the views', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: /get started|continue/i }).click();
    await watchViolations(page);
  });

  test('the header has no view title and the primary action follows the view', async ({ page }) => {
    const header = page.locator('header.app-header');
    await expect(header.getByRole('heading')).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Start recording' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();

    await page.getByRole('button', { name: 'Screenshot' }).click();
    await expect(header.getByRole('button', { name: 'Take screenshot' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Start recording' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Library' }).click();
    await expect(header.getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  });

  test('the stage holds the button and the shortcut in its corner', async ({ page }) => {
    for (const [view, action, keys] of [
      ['Record', 'Start recording', 'Ctrl Shift R'],
      ['Screenshot', 'Take screenshot', 'Ctrl Shift X'],
    ] as const) {
      await page.getByRole('button', { name: view, exact: true }).click();
      const stage = page.locator('.stage');
      const inside = stage.locator('.record-button');
      await expect(inside).toHaveText(action);
      const stageBox = await stage.boundingBox();
      const buttonBox = await inside.boundingBox();
      const keysBox = await stage.getByRole('img', { name: keys }).boundingBox();
      if (!stageBox || !buttonBox || !keysBox) throw new Error('missing box');
      // The button is centered, the keycaps are in the top right corner.
      expect(
        Math.abs(buttonBox.x + buttonBox.width / 2 - (stageBox.x + stageBox.width / 2)),
      ).toBeLessThan(2);
      expect(keysBox.x + keysBox.width).toBeGreaterThan(stageBox.x + stageBox.width - 40);
      expect(keysBox.y).toBeLessThan(stageBox.y + 40);
      // Nothing else on the page repeats the button or the keycaps below the stage.
      await expect(page.getByRole('main').getByRole('button', { name: action })).toHaveCount(1);
    }
  });

  test('a tooltip appears after 400 ms on hover and on keyboard focus, and goes away on Escape', async ({
    page,
  }) => {
    const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await help.hover();
    await page.waitForTimeout(150);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toHaveText('Keyboard shortcuts');
    await page.mouse.move(400, 400);
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    for (let presses = 0; presses < 12; presses += 1) {
      await page.keyboard.press('Tab');
      if (await help.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(help).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Keyboard shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the select is custom, lists each device once, and works from the keyboard', async ({
    page,
  }) => {
    // Let the real device list land first, or it would overwrite the stub below.
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const devices = [
        {
          deviceId: 'default',
          kind: 'videoinput',
          label: 'Default - Integrated Webcam',
          groupId: 'g1',
        },
        { deviceId: 'cam1', kind: 'videoinput', label: 'Integrated Webcam', groupId: 'g1' },
        { deviceId: 'cam2', kind: 'videoinput', label: 'Desk Camera (046d:082d)', groupId: 'g2' },
        { deviceId: 'cam3', kind: 'videoinput', label: 'Capture Card', groupId: 'g3' },
      ];
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve(devices as MediaDeviceInfo[]);
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await page.getByRole('switch', { name: 'Show my face' }).click();

    const select = page.getByRole('combobox', { name: 'Camera to use' });
    await expect(select).toContainText('Integrated Webcam');
    await expect(select).toContainText('Default');
    expect(await page.locator('select').count()).toBe(0);

    await select.click();
    const list = page.getByRole('listbox', { name: 'Camera to use' });
    await expect(list).toBeVisible();
    const options = list.getByRole('option');
    await expect(options).toHaveText(['Integrated WebcamDefault', 'Desk Camera', 'Capture Card']);
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toBeFocused();

    // Hover tints, the list sits inside the window and under its button.
    const listBox = await list.boundingBox();
    const selectBox = await select.boundingBox();
    if (!listBox || !selectBox) throw new Error('missing box');
    expect(listBox.y).toBeGreaterThanOrEqual(selectBox.y + selectBox.height - 1);

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(options.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(options.first()).toBeFocused();
    await page.keyboard.press('c');
    await expect(options.nth(2)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(select).toBeFocused();
    await expect(select).toContainText('Capture Card');

    // Escape closes without changing the choice, and the arrow keys open the list.
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeVisible();
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(select).toContainText('Capture Card');
    await expect(select).toBeFocused();

    expect(await violations(page)).toEqual([]);
  });

  test('the select flips upward when there is no room below', async ({ page }) => {
    await page.evaluate(() => {
      const devices = Array.from({ length: 6 }, (_, index) => ({
        deviceId: `mic${String(index)}`,
        kind: 'audioinput',
        label: `Microphone ${String(index)}`,
        groupId: `g${String(index)}`,
      }));
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve(devices as MediaDeviceInfo[]);
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await page.getByRole('switch', { name: 'Record my voice' }).click();
    const select = page.getByRole('combobox', { name: 'Microphone to use' });
    await expect(select).toBeVisible();
    await select.click();
    const list = page.getByRole('listbox', { name: 'Microphone to use' });
    await expect(list).toBeVisible();
    const listBox = await list.boundingBox();
    const viewport = await page.evaluate(() => window.innerHeight);
    if (!listBox) throw new Error('missing box');
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(viewport);
  });
});
