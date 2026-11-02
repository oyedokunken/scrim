import type { Page } from '@playwright/test';
import { axeViolations } from './axe';
import { expect, test, enterApp } from './fixtures';

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1100, height: 700 },
] as const;

/** Set to a folder to also save a screenshot of Scrim's own page for a visual check. */
const SHOTS = process.env['SCRIM_UI_SHOTS'];

async function go(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function shoot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function expectNoViolations(page: Page): Promise<void> {
  expect(await axeViolations(page)).toEqual([]);
}

for (const size of SIZES) {
  const tag = `${String(size.width)}x${String(size.height)}`;

  test.describe(`the Record, Screenshot and Camera pages at ${tag}`, () => {
    test('the Record page has the folder in its header and compact options without scrolling', async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Record');

      const chip = page.getByRole('button', { name: /^Save to .*Change folder$/ });
      await expect(chip).toBeVisible();
      const title = await page.getByRole('heading', { name: 'Record', level: 1 }).boundingBox();
      const chipBox = await chip.boundingBox();
      if (title === null || chipBox === null) throw new Error('title or chip is not laid out');
      // Same row, and floating right of the title.
      expect(Math.abs(title.y + title.height / 2 - (chipBox.y + chipBox.height / 2))).toBeLessThan(
        12,
      );
      expect(chipBox.x).toBeGreaterThan(title.x + title.width);
      await expect(page.getByRole('button', { name: 'Change folder', exact: true })).toHaveCount(0);

      await expect(page.getByRole('switch', { name: 'Use camera' })).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Use microphone' })).toBeVisible();
      await expect(page.getByText('Show my face')).toHaveCount(0);
      await expect(page.getByText('Record my voice')).toHaveCount(0);
      await expect(page.getByText('Camera to use')).toHaveCount(0);
      await expect(page.getByText('Microphone to use')).toHaveCount(0);

      const overflow = await page.evaluate(() => {
        const main = document.querySelector('.shell-main');
        const panel = document.querySelector('.shell-panel');
        return {
          main: main !== null && main.scrollHeight > main.clientHeight + 1,
          panel: panel !== null && panel.scrollHeight > panel.clientHeight + 1,
          sideways:
            document.documentElement.scrollWidth > document.documentElement.clientWidth ||
            (main !== null && main.scrollWidth > main.clientWidth + 1),
        };
      });
      expect(overflow.sideways).toBe(false);
      if (size.width === 1920) {
        expect(overflow.main).toBe(false);
        expect(overflow.panel).toBe(false);
      }
      await shoot(page, `record-${tag}`);
      await expectNoViolations(page);
    });

    test('the Screenshot page has the folder in its header and no old block', async ({ page }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Screenshot');
      await expect(
        page.getByRole('button', { name: /^Save to Pictures.*Change folder$/ }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Change folder', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Save to' })).toHaveCount(0);
      await shoot(page, `screenshot-${tag}`);
      await expectNoViolations(page);
    });

    test('the Camera page calls its switch Use camera', async ({ page }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Camera');
      await expect(page.getByRole('switch', { name: 'Use camera' })).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Show camera' })).toHaveCount(0);
      await shoot(page, `camera-${tag}`);
      await expectNoViolations(page);
    });

    test('the Attributions card keeps three buttons on one row and opens the developer card', async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Settings');
      const card = page.getByRole('region', { name: 'Attributions' });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('heading', { name: 'Attributions' })).toBeVisible();
      await expect(card.getByRole('heading', { name: 'FFmpeg' })).toBeVisible();
      const row = card.locator('.set-links > *');
      await expect(row).toHaveCount(3);
      const tops = await row.evaluateAll((all) =>
        all.map((element) => Math.round(element.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size).toBe(1);
      const labels = await card.locator('.set-links button').allTextContents();
      expect(labels.map((text) => text.trim())).toEqual(['Source code', 'FFmpeg', 'The developer']);
      const oneLine = await card
        .locator('.set-links button')
        .evaluateAll((all) => all.every((element) => element.scrollWidth <= element.clientWidth));
      expect(oneLine).toBe(true);
      await card.getByRole('button', { name: 'The developer' }).click();
      for (const name of ['Website', 'GitHub', 'LinkedIn']) {
        await expect(card.getByRole('link', { name: new RegExp(name) })).toBeVisible();
      }
      await shoot(page, `attributions-${tag}`);
      await expectNoViolations(page);
    });

    test('settings cards in the same row have equal heights and each title has an icon', async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Settings');
      const report = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.set-section')];
        const rows = new Map<number, number[]>();
        for (const card of cards) {
          const box = card.getBoundingClientRect();
          const key = Math.round(box.top);
          rows.set(key, [...(rows.get(key) ?? []), Math.round(box.height)]);
        }
        return {
          rowsAreEqual: [...rows.values()].every((heights) => new Set(heights).size === 1),
          iconless: cards
            .filter((card) => card.querySelector('.set-title svg') === null)
            .map((card) => card.getAttribute('aria-label')),
        };
      });
      expect(report.rowsAreEqual).toBe(true);
      expect(report.iconless).toEqual([]);
    });

    test('the Settings page drops the removed texts and has no accessibility violations', async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await go(page, 'Settings');
      for (const text of [
        'Shown only here. It is never sent anywhere or saved in the logs.',
        'Logs stay on this computer. They never hold a file path or a window title.',
        'Updates work in the installed app, not in a development run.',
      ]) {
        await expect(page.getByText(text)).toHaveCount(0);
      }
      await expect(page.getByText('Discover a new version of Scrim')).toBeVisible();
      await expect(page.getByText('Last updated')).toHaveCount(0);
      await shoot(page, `settings-${tag}`);
      await expectNoViolations(page);
    });
  });
}
