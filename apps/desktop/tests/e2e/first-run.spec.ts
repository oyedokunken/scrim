import { expect, test } from './fixtures';

test('the first launch checks the camera and microphone once, and never blocks', async ({
  page,
  relaunch,
  app,
}) => {
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(
    page.getByRole('heading', { name: 'Check your camera and microphone' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Record', level: 1 })).toBeVisible();

  // The choice is saved before the app closes.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const bridge = (globalThis as unknown as { scrim: { invoke(c: string): Promise<unknown> } })
          .scrim;
        return ((await bridge.invoke('settings:get')) as { firstRunDone: boolean }).firstRunDone;
      }),
    )
    .toBe(true);

  // The next launch says Continue and goes straight in.
  await app.close();
  const again = await relaunch();
  const second = await again.firstWindow();
  await second.waitForLoadState('domcontentloaded');
  await expect(second.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Get started' })).toHaveCount(0);
  await second.getByRole('button', { name: 'Continue' }).click();
  await expect(second.getByRole('heading', { name: 'Record', level: 1 })).toBeVisible();
});
