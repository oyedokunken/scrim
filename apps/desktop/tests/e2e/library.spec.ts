import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { axeViolations } from './axe';
import { expect, test, enterApp, removeAfterAppCloses } from './fixtures';
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
    // Removed after the app closes, because the app can still have these folders open until then.
    cleanup: () => {
      removeAfterAppCloses(pictures.root, root);
    },
  };
}

async function openLibrary(page: Page): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
}

const cards = (page: Page) => page.locator('.lib-card');

/** Axe must find nothing on the page. Set SCRIM_UI_SHOTS to a folder to also save a picture of Scrim's page. */
async function checkPage(page: Page, name: string): Promise<void> {
  const folder = process.env['SCRIM_UI_SHOTS'];
  if (folder !== undefined) await page.screenshot({ path: `${folder}/${name}.png` });
  expect(await axeViolations(page)).toEqual([]);
}

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
      const names = await detail
        .getByRole('group', { name: 'Actions' })
        .getByRole('button')
        .allTextContents();
      expect(names.map((name) => name.trim())).toEqual([
        'Edit',
        'Copy',
        'Share',
        'Show in folder',
        'Delete',
      ]);
      await expect(detail.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
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

  for (const size of [
    { width: 1100, height: 700 },
    { width: 1920, height: 1080 },
  ] as const) {
    test(`detail actions: five for a screenshot, four in two rows for a recording, one line each at ${String(size.width)}`, async ({
      app,
      page,
    }) => {
      const disk = await arrange(app, true);
      try {
        await page.setViewportSize(size);
        await openLibrary(page);
        const lines = async (): Promise<{ count: number; singleLine: boolean; rows: number[] }> =>
          page.evaluate(() => {
            const buttons = [...document.querySelectorAll('.lib-detail-actions .ui-button')];
            const boxes = buttons.map((button) => button.getBoundingClientRect());
            return {
              count: buttons.length,
              singleLine: buttons.every((button) => {
                const style = getComputedStyle(button);
                return (
                  button.getBoundingClientRect().height <
                    parseFloat(style.lineHeight || '20') * 2 + 8 &&
                  button.scrollWidth <= button.clientWidth + 1
                );
              }),
              rows: [...new Set(boxes.map((box) => Math.round(box.top)))],
            };
          });

        await page.getByRole('button', { name: 'Open Login screen' }).click();
        const shot = await lines();
        await checkPage(page, `library-detail-actions-${String(size.width)}`);
        expect(shot.count).toBe(5);
        expect(shot.singleLine).toBe(true);
        await page.getByRole('button', { name: 'Back', exact: true }).click();

        await page.getByRole('button', { name: 'Open Take 1' }).click({ position: { x: 8, y: 8 } });
        const recording = await lines();
        expect(recording.count).toBe(4);
        expect(recording.singleLine).toBe(true);
        expect(recording.rows).toHaveLength(2);
        const detail = page.getByRole('region', { name: /Details for Take 1/ });
        // A disabled button carries its reason as hidden text, which is not part of its name.
        const names = await detail
          .getByRole('group', { name: 'Actions' })
          .getByRole('button')
          .evaluateAll((all) =>
            all.map((button) =>
              [...button.childNodes]
                .filter(
                  (node) => !(node instanceof Element && node.classList.contains('ui-reason')),
                )
                .map((node) => node.textContent ?? '')
                .join(''),
            ),
          );
        expect(names.map((name) => name.trim())).toEqual([
          'Edit',
          'Share',
          'Show in folder',
          'Delete',
        ]);
        // Equal widths in each row.
        const widths = await detail
          .getByRole('group', { name: 'Actions' })
          .getByRole('button')
          .evaluateAll((all) =>
            all.map((button) => Math.round(button.getBoundingClientRect().width)),
          );
        expect(widths[0]).toBe(widths[1]);
        expect(widths[2]).toBe(widths[3]);
      } finally {
        disk.cleanup();
      }
    });
  }

  test('shows the exported video in a player with its real size, folder and a 12 hour date', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      const mp4 = join(disk.root, 'videos', 'Scrim', 'Take 1.mp4');
      execFileSync(
        process.env['SCRIM_FFMPEG'] ?? 'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=640x360:rate=30',
          '-t',
          '20',
          '-pix_fmt',
          'yuv420p',
          '-y',
          mp4,
        ],
        { stdio: 'ignore' },
      );
      await page.setViewportSize({ width: 1100, height: 700 });
      await openLibrary(page);
      // Pressing the play badge opens the detail and starts the video.
      await page.getByRole('button', { name: 'Play Take 1' }).click();
      const detail = page.getByRole('region', { name: /Details for Take 1/ });
      const video = detail.locator('video');
      await expect(video).toBeVisible();
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth))
        .toBe(640);
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
        .toBe(false);
      await expect(detail.getByText('Not exported yet')).toHaveCount(0);
      await expect(detail.getByRole('button', { name: 'Make video' })).toHaveCount(0);
      const facts = await detail.locator('.lib-detail-facts').innerText();
      expect(facts).toContain(join(disk.root, 'videos', 'Scrim'));
      expect(facts).not.toContain('Projects');
      expect(facts).toMatch(/Size\s*\d[\d.]* (KB|MB)/);
      expect(facts).toMatch(/Created\s*[A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} (AM|PM)/);
      await checkPage(page, 'library-detail-video');
    } finally {
      disk.cleanup();
    }
  });

  test('offers Make video for a recording without an MP4 and keeps the working files', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('button', { name: 'Open Take 1' }).click({ position: { x: 8, y: 8 } });
      const detail = page.getByRole('region', { name: /Details for Take 1/ });
      await expect(detail.getByText('Not exported yet')).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Make video' })).toBeVisible();
      await expect(detail.locator('video')).toHaveCount(0);
      expect(existsSync(join(disk.root, 'local', 'Scrim', 'Projects', 'Take 1.scrim'))).toBe(true);
    } finally {
      disk.cleanup();
    }
  });

  test('shows a screenshot at full size, not a stretched thumbnail', async ({ app, page }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('button', { name: 'Open Login screen' }).click();
      const image = page.getByRole('img', { name: 'Screenshot Login screen' });
      await expect(image).toBeVisible();
      const natural = await image.evaluate((element: HTMLImageElement) => element.naturalWidth);
      expect(natural).toBe(160);
      await checkPage(page, 'library-detail-shot');
    } finally {
      disk.cleanup();
    }
  });

  test('marks every recording with a centered 44 pixel play badge and no screenshot', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(2);
      await checkPage(page, `library-grid-${String(page.viewportSize()?.width)}`);
      for (const card of await cards(page).all()) {
        const isShot = (await card.getByRole('img', { name: 'Screenshot' }).count()) > 0;
        await expect(card.getByRole('button', { name: /^Play / })).toHaveCount(isShot ? 0 : 1);
      }
      const card = cards(page).filter({ hasText: 'Loose clip' });
      const badge = card.getByRole('button', { name: 'Play Loose clip' });
      const badgeBox = await badge.boundingBox();
      const thumbBox = await card.locator('.lib-thumb').boundingBox();
      if (!badgeBox || !thumbBox) throw new Error('no boxes');
      expect(Math.round(badgeBox.width)).toBe(44);
      expect(Math.round(badgeBox.height)).toBe(44);
      expect(
        Math.abs(badgeBox.x + badgeBox.width / 2 - (thumbBox.x + thumbBox.width / 2)),
      ).toBeLessThan(2);
      expect(
        Math.abs(badgeBox.y + badgeBox.height / 2 - (thumbBox.y + thumbBox.height / 2)),
      ).toBeLessThan(2);

      await badge.hover();
      await expect
        .poll(async () => (await badge.boundingBox())?.width ?? 0)
        .toBeGreaterThan(badgeBox.width);

      await badge.click();
      await expect(page.getByRole('region', { name: /Details for Loose clip/ })).toBeVisible();
    } finally {
      disk.cleanup();
    }
  });

  test('keeps Library selected through Edit, always has Back, and returns to the same item', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      const library = page.getByRole('button', { name: 'Library', exact: true });
      const bottom = page.locator('.rail-bottom');
      await expect(bottom.getByRole('button', { name: 'Library' })).toHaveCount(0);
      await expect(library).toHaveAttribute('aria-current', 'page');

      await page.getByRole('button', { name: 'Open Login screen' }).click();
      await expect(library).toHaveAttribute('aria-current', 'page');
      await page
        .getByRole('region', { name: /Details for Login screen/ })
        .getByRole('button', {
          name: 'Edit',
          exact: true,
        })
        .click();

      // The screenshot editor is open, the Library is still the selected item, and Back is there.
      await expect(page.getByRole('toolbar', { name: 'Editing tools' })).toBeVisible();
      await expect(library).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.rail-item[aria-current="page"]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Back', exact: true }).click();

      await expect(page.getByRole('region', { name: /Details for Login screen/ })).toBeVisible();
      await expect(library).toHaveAttribute('aria-current', 'page');
    } finally {
      disk.cleanup();
    }
  });

  test('cards show the type, size and date, and the menu is a 44 pixel button that lists the actions', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      disk.pictures.add('A very long screenshot name that goes on and on and on and on.png', 120);
      await openLibrary(page);
      const card = cards(page).filter({ hasText: 'Login screen' });
      await expect(card.getByRole('img', { name: 'Screenshot' })).toBeVisible();
      await expect(card).toContainText('160 by 90');
      const longCard = cards(page).filter({ hasText: 'A very long screenshot name' });
      const menuButton = longCard.getByRole('button', { name: /^More for/ });
      const box = await menuButton.boundingBox();
      const cardBox = await longCard.boundingBox();
      if (!box || !cardBox) throw new Error('no boxes');
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      await menuButton.focus();
      await page.keyboard.press('Enter');
      for (const name of ['Open', 'Show in folder', 'Share', 'Delete']) {
        await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
      }
    } finally {
      disk.cleanup();
    }
  });

  test('the share menu lists the actions, is keyboard operable, and Copy file puts a file on the clipboard', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page.getByRole('button', { name: 'More for Login screen' }).click();
      await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Share' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Login screen.png')).toBeVisible();
      const options = dialog.getByRole('group', { name: 'Share options' });
      for (const name of ['Copy file', 'Copy image', 'Email', 'Show in folder']) {
        await expect(options.getByRole('button', { name })).toBeVisible();
      }
      await expect(dialog.getByRole('button', { name: 'Copy file path' })).toBeVisible();
      await expect(
        options.getByRole('button', { name: 'Drag the file into another app' }),
      ).toBeVisible();
      // The first action takes keyboard focus, and Escape closes the menu.
      await expect(options.getByRole('button').first()).toBeFocused();

      if (process.platform === 'win32') {
        await options.getByRole('button', { name: 'Copy file' }).click();
        await expect(page.getByText(/File copied/)).toBeVisible();
        const check =
          "Add-Type -AssemblyName System.Windows.Forms; 'drop=' + [System.Windows.Forms.Clipboard]::ContainsFileDropList() + ' text=' + [System.Windows.Forms.Clipboard]::ContainsText() + ' ' + ([System.Windows.Forms.Clipboard]::GetFileDropList() -join ',')";
        const out = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', check], {
          encoding: 'utf8',
        });
        expect(out).toContain('drop=True');
        expect(out).toContain('text=False');
        expect(out).toContain('Login screen.png');
      }
    } finally {
      disk.cleanup();
    }
  });

  test('warns about a video over 25 MB and offers a smaller copy', async ({ app, page }) => {
    const disk = await arrange(app, true);
    try {
      writeFileSync(
        join(disk.root, 'videos', 'Scrim', 'Big clip.mp4'),
        Buffer.alloc(26 * 1024 * 1024),
      );
      await openLibrary(page);
      await page.getByRole('button', { name: 'More for Big clip' }).click();
      await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Share' });
      await expect(dialog.getByRole('note')).toContainText('limit attachments');
      await expect(dialog.getByRole('button', { name: 'Make a smaller copy' })).toBeVisible();
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
      // The refusal is shown in the app's error dialog, which has to be closed before typing again.
      await expect(page.getByText('A file with that name already exists')).toBeVisible();
      await page
        .getByRole('dialog', { name: 'That name is taken' })
        .locator('button.ui-button', { hasText: 'Close' })
        .click();
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

  test('a rendered video finds its project, even under another name, and Edit is on', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      const videos = join(disk.root, 'videos', 'Scrim');
      const project = join(disk.root, 'local', 'Scrim', 'Projects', 'Take 1.scrim');
      const target = join(videos, 'Launch day.mp4');
      writeFileSync(target, 'not really a video');
      writeFileSync(
        join(project, 'export.json'),
        JSON.stringify({
          version: 1,
          exportedAt: '2026-10-28T10:05:00.000Z',
          file: target,
          bytes: 18,
          projectId: '6b6f8f64-8f6e-4a4a-9d3a-111111111111',
        }),
      );
      await openLibrary(page);
      // One card for the recording and its video, not a recording and a loose file.
      await expect(cards(page).filter({ hasText: 'Launch day' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Open Take 1' }).click({ position: { x: 8, y: 8 } });
      const detail = page.getByRole('region', { name: /Details for Take 1/ });
      await expect(detail.getByText('Not exported yet')).toHaveCount(0);
      await expect(detail.getByRole('button', { name: 'Make video' })).toHaveCount(0);
      const edit = detail.getByRole('button', { name: 'Edit', exact: true });
      await expect(edit).not.toHaveAttribute('aria-disabled', 'true');
      await expect(detail.getByTestId('edit-reason')).toHaveCount(0);
      await edit.click();
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
      await expect(detail).toHaveCount(0);
    } finally {
      disk.cleanup();
    }
  });

  test('a video whose project is gone explains why Edit is off, on hover, on focus and under the buttons', async ({
    app,
    page,
  }) => {
    const disk = await arrange(app, true);
    try {
      await openLibrary(page);
      await page
        .getByRole('button', { name: 'Open Loose clip' })
        .click({ position: { x: 8, y: 8 } });
      const detail = page.getByRole('region', { name: /Details for Loose clip/ });
      const edit = detail.getByRole('button', { name: 'Edit', exact: true });
      const reason =
        "The original recording files are no longer on this computer, so this video can't be edited.";
      await expect(edit).toHaveAttribute('aria-disabled', 'true');
      await expect(detail.getByTestId('edit-reason')).toHaveText(reason);
      const tip = edit.locator('.ui-reason');
      await expect(tip).toBeHidden();
      await edit.hover();
      await expect(tip).toBeVisible();
      await expect(tip).toHaveText(reason);
      await page.mouse.move(0, 0);
      await expect(tip).toBeHidden();
      await edit.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(edit).toBeFocused();
      await expect(tip).toBeVisible();
      await expect(edit).toHaveAccessibleDescription(reason);
      await page.keyboard.press('Escape');
      await expect(tip).toBeHidden();
      // Pressing it does nothing: no editor opens.
      await edit.click({ force: true });
      await expect(page.getByRole('region', { name: /Details for Loose clip/ })).toBeVisible();
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
