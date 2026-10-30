import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, enterApp } from './fixtures';

async function openSettings(page: Page): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

/** The saved settings file. The store writes a moment after a change, so poll for it. */
async function saved(userDataDir: string, key: string, expected: unknown): Promise<void> {
  await expect
    .poll(
      () => {
        try {
          const file = JSON.parse(
            readFileSync(join(userDataDir, 'settings.json'), 'utf8'),
          ) as Record<string, unknown>;
          return file[key];
        } catch {
          return undefined;
        }
      },
      { timeout: 8000 },
    )
    .toEqual(expected);
}

const registered = (app: ElectronApplication, accelerator: string) =>
  app.evaluate(({ globalShortcut }, key) => globalShortcut.isRegistered(key), accelerator);

/**
 * Whether Windows let this app have a default shortcut. Another program, such as a second copy of
 * Scrim that is already running, can own it, and then the app reports it as unavailable instead of
 * registering it. So the app must register exactly the shortcuts it says it could take.
 */
async function couldTake(page: Page, id: 'record' | 'stop' | 'screenshot'): Promise<boolean> {
  const status = await page.evaluate(() =>
    (
      globalThis as unknown as {
        scrim: { invoke(channel: string): Promise<{ unavailable: string[] }> };
      }
    ).scrim.invoke('shortcuts:status'),
  );
  return !status.unavailable.includes(id);
}

test.describe('the settings', () => {
  test('rebinds a shortcut by pressing keys, and the new keys work at once', async ({
    app,
    page,
    userDataDir,
  }) => {
    await openSettings(page);
    expect(await registered(app, 'CommandOrControl+Shift+X')).toBe(
      await couldTake(page, 'screenshot'),
    );
    await page.getByRole('button', { name: 'Change take screenshot shortcut' }).click();
    await expect(page.getByText('Press the new keys')).toBeVisible();
    // While a key is being chosen the global shortcuts let go, so the old keys cannot run.
    await expect.poll(() => registered(app, 'CommandOrControl+Shift+X')).toBe(false);
    await page.keyboard.press('Control+Alt+K');
    await expect(
      page.getByRole('region', { name: 'Shortcuts' }).getByLabel('Ctrl Alt K'),
    ).toBeVisible();
    await saved(userDataDir, 'shortcutScreenshot', 'CommandOrControl+Alt+K');
    await expect.poll(() => registered(app, 'CommandOrControl+Alt+K')).toBe(true);
    expect(await registered(app, 'CommandOrControl+Shift+X')).toBe(false);
    expect(await registered(app, 'CommandOrControl+Shift+R')).toBe(await couldTake(page, 'record'));

    await page.getByRole('button', { name: 'Reset take screenshot shortcut' }).click();
    await saved(userDataDir, 'shortcutScreenshot', 'CommandOrControl+Shift+X');
    await expect
      .poll(async () => registered(app, 'CommandOrControl+Shift+X'))
      .toBe(await couldTake(page, 'screenshot'));
    expect(await registered(app, 'CommandOrControl+Alt+K')).toBe(false);
  });

  test('refuses keys another shortcut uses, and Escape gives up', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Change stop and save shortcut' }).click();
    await page.keyboard.press('Control+Shift+R');
    await expect(page.getByRole('alert')).toContainText('already start recording');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Press the new keys')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Shortcuts' }).getByLabel('Ctrl Shift S'),
    ).toBeVisible();
  });

  test('says to hold a modifier when a bare letter is pressed', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: 'Change start recording shortcut' }).click();
    await page.keyboard.press('r');
    await expect(page.getByRole('alert')).toContainText('Hold Ctrl or Alt');
  });

  test('saves the recording switches and the welcome switch at once', async ({
    page,
    userDataDir,
  }) => {
    await openSettings(page);
    await page.getByRole('switch', { name: /Count down/ }).click();
    await saved(userDataDir, 'countdownOn', false);
    await page.getByRole('switch', { name: /camera on/ }).click();
    await saved(userDataDir, 'cameraOn', true);
    await page.getByRole('switch', { name: /microphone on/ }).click();
    await saved(userDataDir, 'micOn', true);
    await page.getByRole('switch', { name: /Show the welcome screen/ }).click();
    await saved(userDataDir, 'showWelcome', false);
  });

  test('Show welcome again shows the welcome screen even when it is switched off', async ({
    page,
  }) => {
    await openSettings(page);
    await page.getByRole('switch', { name: /Show the welcome screen/ }).click();
    await page.getByRole('button', { name: 'Show welcome again' }).click();
    await expect(page.getByRole('heading', { name: 'Scrim', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('changes the folders through the system picker, and shows them', async ({
    app,
    page,
    userDataDir,
  }) => {
    const chosen = mkdtempSync(join(tmpdir(), 'scrim-pick-'));
    try {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [folder] });
      }, chosen);
      await openSettings(page);
      await expect(page.getByText('Videos\\Scrim (default)')).toBeVisible();
      await expect(page.getByText('Pictures\\Scrim (default)')).toBeVisible();
      await page.getByRole('button', { name: 'Change screenshots' }).click();
      await saved(userDataDir, 'screenshotFolder', chosen);
      await expect(page.getByText(chosen)).toBeVisible();
      await expect(page.getByText('Videos\\Scrim (default)')).toBeVisible();
      await page.getByRole('button', { name: 'Change recordings' }).click();
      await saved(userDataDir, 'destinationFolder', chosen);
    } finally {
      rmSync(chosen, { recursive: true, force: true });
    }
  });

  test('has an About with the version, the licenses and the source link', async ({ page }) => {
    await openSettings(page);
    const about = page.getByRole('region', { name: 'About' });
    await expect(
      about.getByText('A free, open source screen recorder and screenshot tool'),
    ).toBeVisible();
    await expect(about.getByText(/^1./)).toBeVisible();
    await expect(about.getByText('MIT', { exact: true })).toBeVisible();
    await expect(about.getByText('Computer name')).toBeVisible();
    await expect(about.getByText(/never sent anywhere/)).toBeVisible();
    await expect(about.getByText(/LGPL version 3/)).toBeVisible();
    await expect(about.getByRole('button', { name: 'Source code' })).toBeVisible();
    await expect(about.getByRole('button', { name: 'About the FFmpeg license' })).toBeVisible();
    await expect(about.locator('.built-by-handle')).toHaveText('@oyedokunken');
    await expect(page.getByRole('button', { name: 'Open logs folder' })).toBeVisible();
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways).toBe(false);
  });

  test('lays the cards out in two equal columns, with green buttons that turn black', async ({
    page,
  }) => {
    await openSettings(page);
    const cards = page.locator('.set-section');
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    expect(Math.abs(first.y - second.y)).toBeLessThan(1);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
    expect(Math.abs(first.height - second.height)).toBeLessThan(1);

    const button = page.getByRole('button', { name: 'Show welcome again' });
    const colors = () =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
    expect(await colors()).toEqual({ background: 'rgb(0, 78, 82)', color: 'rgb(255, 255, 255)' });
    await button.hover();
    // The background eases in, so wait for it to settle.
    await expect.poll(colors).toEqual({ background: 'rgb(0, 0, 0)', color: 'rgb(255, 255, 255)' });
  });
});
