import type { Page } from '@playwright/test';
import { expect, test, enterApp } from './fixtures';

const VIEWS = [
  'Record',
  'Screenshot',
  'Library',
  'Cursor',
  'Zoom',
  'Camera',
  'Audio',
  'Background',
  'Settings',
] as const;

/** Only these pages change how a recording looks, so only they keep a right sidebar. */
const WITH_SIDEBAR = ['Cursor', 'Zoom', 'Camera', 'Audio', 'Background'];

const SIZES = [
  { width: 1100, height: 700 },
  { width: 946, height: 603 },
] as const;

interface Report {
  sideways: string[];
  /** Elements that stick out past the right edge of the panel or the main area. */
  pokingOut: string[];
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
    const pokingOut: string[] = [];
    for (const selector of ['.shell-main', '.shell-panel']) {
      const container = document.querySelector(selector);
      if (!container) continue;
      const edge = container.getBoundingClientRect().right;
      for (const element of container.querySelectorAll('*')) {
        if (!visible(element) || element.closest('[popover]')) continue;
        if (element.getBoundingClientRect().right > edge + 1) pokingOut.push(label(element));
      }
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
    return { sideways, pokingOut, notPointer, unnamed, native, railOutside };
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
        // Record and Screenshot keep their few controls under the main view, not in a sidebar.
        await expect(page.locator('.shell-panel')).toHaveCount(WITH_SIDEBAR.includes(view) ? 1 : 0);
        const report = await inspect(page);
        expect(report.sideways, `${view}: sideways overflow`).toEqual([]);
        expect(report.pokingOut, `${view}: sticks out past its area`).toEqual([]);
        expect(report.notPointer, `${view}: not a pointer`).toEqual([]);
        expect(report.unnamed, `${view}: buttons with no name`).toEqual([]);
        expect(report.native, `${view}: native controls or title tooltips`).toEqual([]);
        expect(report.railOutside, `${view}: the rail runs past the status bar`).toBe(false);
      }
    });
  }
});

test.describe('long device names', () => {
  for (const size of SIZES) {
    test(`stay inside the Record controls at ${String(size.width)} by ${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await enterApp(page);
      await page.evaluate(() => {
        const devices = navigator.mediaDevices;
        const make = (kind: string, id: string, label: string, group: string) => ({
          kind,
          deviceId: id,
          label,
          groupId: group,
        });
        devices.enumerateDevices = () =>
          Promise.resolve([
            make(
              'audioinput',
              'default',
              'Default - Microphone Array (Intel Smart Sound Technology for Digital Microphones)',
              'g1',
            ),
            make(
              'audioinput',
              'mic1',
              'Microphone Array (Intel Smart Sound Technology for Digital Microphones)',
              'g1',
            ),
            make(
              'videoinput',
              'cam1',
              'Integrated Camera With A Very Long Marketing Name (13d3:56b2)',
              'g2',
            ),
          ] as MediaDeviceInfo[]);
        devices.dispatchEvent(new Event('devicechange'));
      });
      await expect(page.getByText('Default', { exact: true }).first()).toBeVisible();
      const report = await inspect(page);
      expect(report.sideways).toEqual([]);
      expect(report.pokingOut).toEqual([]);
      const scrollbar = await page.evaluate(() => {
        const panel = document.querySelector('.record-controls');
        return panel !== null && panel.scrollWidth > panel.clientWidth;
      });
      expect(scrollbar).toBe(false);
      await expect(page.locator('.shell-panel')).toHaveCount(0);
    });
  }
});
