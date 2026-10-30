import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, enterApp } from './fixtures';
import { picturesFixture } from './png-fixture';

function sessionJson(name: string): string {
  return JSON.stringify({
    version: 1,
    id: '6b6f8f64-8f6e-4a4a-9d3a-111111111111',
    name,
    createdAt: '2026-10-28T10:00:00.000Z',
    app: { version: '1.0.0', os: 'windows', arch: 'x64' },
    pid: 123,
    source: { kind: 'display', origin: { x: 0, y: 0 }, scaleFactor: 1 },
    capture: { cursorInCapture: true },
    tracks: [
      {
        kind: 'screen',
        file: 'screen.webm',
        mimeType: 'video/webm',
        startedAt: 0,
        bytesWritten: 10,
        complete: true,
      },
    ],
    clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
    pauses: [],
    input: { status: 'unavailable', reason: 'error' },
    warnings: [],
    heartbeatAt: '2026-10-28T10:01:00.000Z',
    heartbeatElapsedMs: 42_000,
    cleanClose: true,
  });
}

interface Disk {
  root: string;
  pictures: ReturnType<typeof picturesFixture>;
  cleanup: () => void;
}

/** Points the pictures, videos and local app data folders at temp folders with a few things in them. */
async function arrange(app: ElectronApplication, withItems: boolean): Promise<Disk> {
  const pictures = picturesFixture();
  const root = mkdtempSync(join(tmpdir(), 'scrim-lib-'));
  const videos = join(root, 'videos');
  const local = join(root, 'local');
  mkdirSync(join(videos, 'Scrim'), { recursive: true });
  mkdirSync(join(local, 'Scrim', 'Projects'), { recursive: true });
  if (withItems) {
    pictures.add('Pricing page.png', 600);
    pictures.add('Login screen.png', 300);
    writeFileSync(join(videos, 'Scrim', 'Loose clip.mp4'), 'not really a video');
    const project = join(local, 'Scrim', 'Projects', 'Take 1.scrim');
    mkdirSync(project);
    writeFileSync(join(project, 'session.json'), sessionJson('Take 1'));
  }
  await app.evaluate(
    ({ app: electronApp }, args) => {
      electronApp.setPath('pictures', args.pictures);
      electronApp.setPath('videos', args.videos);
      process.env['LOCALAPPDATA'] = args.local;
    },
    { pictures: pictures.root, videos, local },
  );
  return {
    root,
    pictures,
    cleanup: () => {
      pictures.cleanup();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

async function openLibrary(page: Page): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
}

const cards = (page: Page) => page.locator('.lib-card');

test.describe('the library', () => {
  test('lists recordings and screenshots, filters, searches and sorts them', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await expect(cards(page)).toHaveCount(4);
      await expect(page.getByText('Screenshot', { exact: false }).first()).toBeVisible();

      await page.getByRole('radio', { name: 'Screenshots' }).click();
      await expect(cards(page)).toHaveCount(2);
      await page.getByRole('radio', { name: 'Recordings' }).click();
      await expect(cards(page)).toHaveCount(2);
      await page.getByRole('radio', { name: 'All' }).click();

      await page.getByRole('searchbox', { name: 'Search by name' }).fill('login');
      await expect(cards(page)).toHaveCount(1);
      await expect(cards(page).first()).toContainText('Login screen');
      await page.getByRole('searchbox', { name: 'Search by name' }).fill('zzz');
      await expect(page.getByText('Nothing matches.')).toBeVisible();
      await page.getByRole('searchbox', { name: 'Search by name' }).fill('');

      await page.getByRole('radio', { name: 'Newest' }).click();
      const newestFirst = await cards(page).locator('.lib-name').allTextContents();
      await page.getByRole('radio', { name: 'Oldest' }).click();
      const oldestFirst = await cards(page).locator('.lib-name').allTextContents();
      expect(oldestFirst).toEqual([...newestFirst].reverse());

      // The page never scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    } finally {
      disk.cleanup();
    }
  });

  test('opens a detail page that keeps the filters, and goes back with Back or Escape', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('radio', { name: 'Screenshots' }).click();
      await page.getByRole('button', { name: 'Open Login screen' }).click();
      const detail = page.getByRole('region', { name: /Details for Login screen/ });
      await expect(detail).toBeVisible();
      await expect(detail.getByText('Login screen.png').first()).toBeVisible();
      await expect(detail.getByText('160 by 90')).toBeVisible();
      for (const name of ['Open', 'Show in folder', 'Copy', 'Delete']) {
        await expect(detail.getByRole('button', { name, exact: true })).toBeVisible();
      }
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(cards(page)).toHaveCount(2);
      await expect(page.getByRole('radio', { name: 'Screenshots' })).toBeChecked();

      await page.getByRole('button', { name: 'Open Login screen' }).click();
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await expect(cards(page)).toHaveCount(2);
    } finally {
      disk.cleanup();
    }
  });

  test('marks anything made in the last day with a NEW pill', async ({ app, page }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await expect(page.locator('.lib-new').first()).toHaveText('NEW');
    } finally {
      disk.cleanup();
    }
  });

  test('renames a screenshot on disk and refuses a name that is taken', async ({ app, page }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('button', { name: 'More for Login screen' }).click();
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      const box = page.getByRole('textbox', { name: 'New name' });
      await box.fill('Pricing page');
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(page.getByText('A file with that name already exists')).toBeVisible();
      await box.fill('Sign in');
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(cards(page).filter({ hasText: 'Sign in' })).toHaveCount(1);
      expect(existsSync(join(disk.pictures.folder, 'Sign in.png'))).toBe(true);
      expect(existsSync(join(disk.pictures.folder, 'Login screen.png'))).toBe(false);
    } finally {
      disk.cleanup();
    }
  });

  test('asks before deleting, and the safe button has focus', async ({ app, page }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('button', { name: 'More for Login screen' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      const dialog = page.getByRole('dialog', { name: /Delete Login screen/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Close' }).click();
      expect(existsSync(join(disk.pictures.folder, 'Login screen.png'))).toBe(true);

      await page.getByRole('button', { name: 'More for Login screen' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await page
        .getByRole('dialog', { name: /Delete Login screen/ })
        .getByRole('button', { name: 'Delete' })
        .click();
      await expect(cards(page)).toHaveCount(3);
      expect(existsSync(join(disk.pictures.folder, 'Login screen.png'))).toBe(false);
    } finally {
      disk.cleanup();
    }
  });

  test('shows an empty state with a way to record', async ({ app, page }) => {
    const disk = await arrange(app, false);
    try {
      await openLibrary(page);
      await expect(page.getByText('Nothing here yet')).toBeVisible();
      await page.getByRole('button', { name: 'Record your screen' }).click();
      await expect(page.getByRole('heading', { name: 'Record', level: 1 })).toBeVisible();
    } finally {
      disk.cleanup();
    }
  });
});
