import type { Page } from '@playwright/test';
import { expect, test, enterApp } from './fixtures';

const VIEWS = [
  'Record',
  'Screenshot',
  'Cursor',
  'Zoom',
  'Camera',
  'Audio',
  'Background',
  'Library',
  'Settings',
] as const;

const SIZES = [
  { width: 1100, height: 700 },
  { width: 946, height: 603 },
] as const;

interface Report {
  sideways: string[];
  notPointer: string[];
  unnamed: string[];
  native: string[];
  railOutside: boolean;
}

/** Looks at everything on screen in the current view and reports what breaks the UI rules. */
async function inspect(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
    };
    const label = (element: Element): string =>
      `${element.tagName.toLowerCase()}.${element.className}`;
    const sideways: string[] = [];
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) {
      sideways.push('document');
    }
    for (const selector of ['.shell-main', '.shell-panel', '.shell']) {
      const element = document.querySelector(selector);
      if (element && element.scrollWidth > element.clientWidth + 1) sideways.push(selector);
    }
    const notPointer: string[] = [];
    const unnamed: string[] = [];
    const interactive = document.querySelectorAll(
      'button, [role="switch"], [role="radio"], [role="menuitem"], [role="option"], a[href]',
    );
    for (const element of interactive) {
      if (!visible(element)) continue;
      if (element instanceof HTMLButtonElement && element.disabled) continue;
      if (getComputedStyle(element).cursor !== 'pointer') notPointer.push(label(element));
      const name = (element.getAttribute('aria-label') ?? element.textContent).trim();
      if (name === '' && element.getAttribute('aria-labelledby') === null) {
        unnamed.push(label(element));
      }
    }
    const native = [
      ...document.querySelectorAll('select, input[type="checkbox"], input[type="radio"], [title]'),
    ]
      .filter(visible)
      .map(label);
    const rail = document.querySelector('.rail');
    const last = document.querySelector('.rail-bottom .rail-item:last-child');
    const status = document.querySelector('.status-bar');
    const railOutside =
      rail !== null && last !== null && status !== null
        ? last.getBoundingClientRect().bottom > status.getBoundingClientRect().top + 1
        : true;
    return { sideways, notPointer, unnamed, native, railOutside };
  });
}

test.describe('the interface rules, on every page', () => {
  for (const size of SIZES) {
    test(`no sideways scroll, pointer cursors, named buttons and no native controls at ${String(size.width)} by ${String(size.height)}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(size);
      await enterApp(page);
      for (const view of VIEWS) {
        await page.getByRole('button', { name: view, exact: true }).click();
        await expect(page.getByRole('heading', { name: view, level: 1 })).toBeVisible();
        const report = await inspect(page);
        expect(report.sideways, `${view}: sideways overflow`).toEqual([]);
        expect(report.notPointer, `${view}: not a pointer`).toEqual([]);
        expect(report.unnamed, `${view}: buttons with no name`).toEqual([]);
        expect(report.native, `${view}: native controls or title tooltips`).toEqual([]);
        expect(report.railOutside, `${view}: the rail runs past the status bar`).toBe(false);
      }
    });
  }
});
