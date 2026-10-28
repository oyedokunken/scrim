import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function open(page: Page, view: string): Promise<void> {
  await page.getByRole('button', { name: /get started|continue/i }).click();
  await page.getByRole('button', { name: view, exact: true }).click();
  await expect(page.getByRole('heading', { name: view, level: 1 })).toBeVisible();
}

async function noSidewaysScroll(page: Page): Promise<void> {
  for (const selector of ['.shell-panel', '.shell-main']) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
}

/** The saved settings, read through the typed bridge the page already has. */
async function savedSettings(page: Page): Promise<unknown> {
  return page.evaluate(() =>
    (window as unknown as { scrim: { invoke(channel: string): Promise<unknown> } }).scrim.invoke(
      'settings:get',
    ),
  );
}

test.describe('the Camera page', () => {
  test('size, shape and corner change the preview, and a dragged bubble snaps to a corner', async ({
    page,
  }) => {
    await open(page, 'Camera');
    await page.getByRole('switch', { name: 'Show camera' }).click();
    const bubble = page.locator('.bubble');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveClass(/bubble-bottom-right/);

    await page.getByRole('radio', { name: 'Large' }).click();
    await expect(bubble).toHaveClass(/bubble-L/);
    await page.getByRole('radio', { name: 'Rounded' }).click();
    await expect(bubble).toHaveClass(/bubble-rounded-square/);
    await page.getByRole('radio', { name: 'Top left' }).click();
    await expect(bubble).toHaveClass(/bubble-top-left/);

    // Drag it to the bottom left corner of the frame.
    const frame = await page.locator('.mock-frame').boundingBox();
    const from = await bubble.boundingBox();
    if (!frame || !from) throw new Error('no boxes');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(frame.x + 20, frame.y + frame.height - 20, { steps: 6 });
    await page.mouse.up();
    await expect(bubble).toHaveClass(/bubble-bottom-left/);
    await noSidewaysScroll(page);
  });

  test('the choices are saved', async ({ page }) => {
    await open(page, 'Camera');
    await page.getByRole('switch', { name: 'Show camera' }).click();
    await page.getByRole('radio', { name: 'Small' }).click();
    await page.getByRole('radio', { name: 'Top right' }).click();
    await page.waitForTimeout(400);
    const saved = await savedSettings(page);
    expect(saved).toMatchObject({ cameraOn: true, bubbleSize: 'S', bubbleCorner: 'top-right' });
  });
});

test.describe('the Audio page', () => {
  test('keep sound and volume are saved, and the meter is there', async ({ page }) => {
    await open(page, 'Audio');
    await expect(page.getByRole('meter', { name: 'Microphone level' })).toBeVisible();
    await page.getByRole('radio', { name: 'Louder' }).click();
    await expect(page.getByRole('radio', { name: 'Louder' })).toBeChecked();
    await page.getByRole('switch', { name: 'Keep sound' }).click();
    await expect(page.getByRole('radio', { name: 'Quieter' })).toBeDisabled();
    await expect(page.getByText('Sound is off')).toBeVisible();
    await page.waitForTimeout(400);
    const saved = await savedSettings(page);
    expect(saved).toMatchObject({ keepSound: false, micVolume: 'louder' });
    await noSidewaysScroll(page);
  });
});

test.describe('the Background page', () => {
  test('presets, padding, corners and shadow change the preview and are saved', async ({
    page,
  }) => {
    await open(page, 'Background');
    const frame = page.locator('.bg-frame');
    await expect(frame).toHaveClass(/bg-deep-green/);
    await page.getByRole('radio', { name: 'Dots' }).click();
    await expect(frame).toHaveClass(/bg-dots/);
    await page.getByRole('radio', { name: 'Large' }).click();
    await expect(frame).toHaveAttribute('data-padding', 'large');
    await page.getByRole('radio', { name: 'Round' }).click();
    await expect(frame).toHaveAttribute('data-corners', 'round');
    await page.getByRole('switch', { name: 'Soft shadow' }).click();
    await expect(frame).toHaveAttribute('data-shadow', 'off');
    await page.getByRole('radio', { name: 'None' }).click();
    await expect(frame).toHaveClass(/bg-none-frame/);
    await expect(page.getByRole('radio', { name: 'Large' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: /Your image/ })).toBeDisabled();
    await page.waitForTimeout(400);
    const saved = await savedSettings(page);
    expect(saved).toMatchObject({
      backgroundId: 'none',
      backgroundPadding: 'large',
      backgroundCorners: 'round',
      backgroundShadow: false,
    });
    await noSidewaysScroll(page);
  });

  test('shows a still preview with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'Background');
    const animated = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === 'running').length,
    );
    expect(animated).toBe(0);
  });
});
