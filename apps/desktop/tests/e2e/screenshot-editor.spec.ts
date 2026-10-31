import type { ElectronApplication, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, enterApp, removeAfterAppCloses } from './fixtures';

const WIDTH = 600;
const HEIGHT = 400;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

/** A small PNG with a flat background and a block of fine stripes, which a blur must change. */
function makePng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (WIDTH * 3 + 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const striped = x >= 300 && x < 500 && y >= 100 && y < 250 && (x + y) % 6 < 3;
      const at = row + 1 + x * 3;
      raw[at] = striped ? 0 : 235;
      raw[at + 1] = striped ? 0 : 230;
      raw[at + 2] = striped ? 0 : 220;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizeOf = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

interface Fixture {
  folder: string;
  original: string;
  originalHash: string;
  cleanup: () => void;
}

/**
 * Points the pictures folder at a temp folder, writes one screenshot there, and makes the area chooser
 * answer with it, so the test drives the real result screen and editor without an overlay.
 */
async function arrange(app: ElectronApplication): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'scrim-shots-'));
  const folder = join(root, 'Scrim');
  mkdirSync(folder, { recursive: true });
  const original = join(folder, 'shot-test.png');
  writeFileSync(original, makePng());
  await app.evaluate(
    ({ app: electronApp, ipcMain }, args) => {
      electronApp.setPath('pictures', args.root);
      ipcMain.removeHandler('area:run');
      ipcMain.handle('area:run', () => ({
        ok: true,
        mode: 'screenshot',
        result: { path: args.original, copied: true, width: args.width, height: args.height },
      }));
    },
    { root, original, width: WIDTH, height: HEIGHT },
  );
  return {
    folder,
    original,
    originalHash: hash(original),
    cleanup: () => {
      removeAfterAppCloses(root);
    },
  };
}

async function openResult(page: Page): Promise<void> {
  await enterApp(page);
  await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
  await page.locator('.stage').getByRole('button', { name: 'Take screenshot' }).click();
  await expect(page.getByRole('img', { name: /Screenshot 600 by 400/ })).toBeVisible();
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const canvas = page.locator('canvas.shot-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The canvas is not visible');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
  await page.mouse.up();
}

const status = (page: Page) => page.getByRole('status').filter({ hasText: /marks?\b/ });

test.describe('the screenshot editor', () => {
  test('crop, arrow, text and blur, then Done writes a new file and leaves the original alone', async ({
    app,
    page,
  }) => {
    test.setTimeout(90_000);
    const fixture = await arrange(app);
    try {
      await page.evaluate(() => {
        const store: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations = store;
        document.addEventListener('securitypolicyviolation', (event) => {
          store.push(event.violatedDirective);
        });
      });
      await openResult(page);
      await expect(page.getByText('Saved as shot-test.png and copied')).toBeVisible();

      await page.getByRole('button', { name: 'Edit' }).click();
      const toolbar = page.getByRole('toolbar', { name: 'Editing tools' });
      await expect(toolbar).toBeVisible();
      await expect(status(page)).toContainText('600 by 400. 0 marks');

      // Every tool has a name and a key, and the key works.
      for (const [name, key] of [
        ['Crop', 'c'],
        ['Arrow', 'a'],
        ['Box', 'r'],
        ['Highlight', 'h'],
        ['Text', 't'],
        ['Blur', 'b'],
        ['Select', 'v'],
      ] as const) {
        await page.keyboard.press(key);
        await expect(toolbar.getByRole('button', { name, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      }

      // Color and thickness are segmented controls.
      await page.getByRole('radio', { name: 'Green' }).click();
      await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked();
      await page.getByRole('radio', { name: 'Red' }).click();
      await page.getByRole('radio', { name: 'Thick' }).click();
      await expect(page.getByRole('radio', { name: 'Thick' })).toBeChecked();

      // Crop.
      await page.keyboard.press('c');
      await drag(page, [20, 20], [420, 320]);
      await expect(status(page)).toContainText(/\d+ by \d+\. 0 marks/);
      await expect(status(page)).not.toContainText('600 by 400');
      const cropped = (await status(page).textContent()) ?? '';

      // Arrow, then text, then blur.
      await page.keyboard.press('a');
      await drag(page, [40, 40], [200, 120]);
      await expect(status(page)).toContainText('1 mark, arrow selected');

      await page.keyboard.press('t');
      const canvasBox = await page.locator('canvas.shot-canvas').boundingBox();
      if (!canvasBox) throw new Error('no canvas');
      await page.mouse.click(canvasBox.x + 60, canvasBox.y + 200);
      await page.getByRole('textbox', { name: 'Text to add' }).fill('Look here');
      await page.keyboard.press('Enter');
      await expect(status(page)).toContainText('2 marks, text selected');

      await page.keyboard.press('b');
      await drag(page, [180, 80], [380, 230]);
      await expect(status(page)).toContainText('3 marks, blur selected');

      // Undo and redo step through every edit.
      const undo = page.getByRole('button', { name: 'Undo' });
      const redo = page.getByRole('button', { name: 'Redo' });
      await expect(redo).toBeDisabled();
      await page.keyboard.press('Control+z');
      await expect(status(page)).toContainText('2 marks');
      await expect(redo).toBeEnabled();
      await page.keyboard.press('Control+Shift+z');
      await expect(status(page)).toContainText('3 marks');
      await undo.click();
      await undo.click();
      await undo.click();
      await expect(status(page)).toContainText('0 marks');
      await expect(status(page)).toContainText(cropped.match(/\d+ by \d+/)?.[0] ?? 'x');
      await undo.click();
      await expect(status(page)).toContainText('600 by 400');
      await expect(undo).toBeDisabled();
      for (let step = 0; step < 4; step += 1) await redo.click();
      await expect(status(page)).toContainText('3 marks');

      // Select an annotation, delete it with the keyboard, and bring it back with undo.
      await page.keyboard.press('v');
      const box = await page.locator('canvas.shot-canvas').boundingBox();
      if (!box) throw new Error('no canvas');
      await page.mouse.click(box.x + 80, box.y + 240);
      await expect(status(page)).toContainText('3 marks, text selected');
      await page.keyboard.press('Delete');
      await expect(status(page)).toContainText('2 marks');
      await page.keyboard.press('Control+z');
      await expect(status(page)).toContainText('3 marks');

      // Done.
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByText(/Saved shot-test-edited\.png and copied it/)).toBeVisible();
      const edited = join(fixture.folder, 'shot-test-edited.png');
      const files = readdirSync(fixture.folder).sort();
      expect(files).toEqual(['shot-test-edited.png', 'shot-test.png']);
      const editedPng = readFileSync(edited);
      expect(editedPng.subarray(1, 4).toString('ascii')).toBe('PNG');
      const size = sizeOf(editedPng);
      expect(size.width).toBeLessThan(WIDTH);
      expect(size.height).toBeLessThan(HEIGHT);
      expect(`${String(size.width)} by ${String(size.height)}`).toBe(
        cropped.match(/\d+ by \d+/)?.[0],
      );
      expect(hash(edited)).not.toBe(fixture.originalHash);
      // The original is exactly as it was.
      expect(hash(fixture.original)).toBe(fixture.originalHash);

      // The edited picture is on the clipboard and the result screen shows it.
      expect(
        await app.evaluate(async ({ clipboard }) => {
          const items = await clipboard.read();
          return items.some((item) => item.types.includes('image/png'));
        }),
      ).toBe(true);
      await expect(page.getByText(/Saved as shot-test-edited\.png/)).toBeVisible();

      expect(
        await page.evaluate(
          () => (globalThis as unknown as { __violations: string[] }).__violations,
        ),
      ).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  test('every tool has a tooltip on keyboard focus, and the stroke buttons are equal and clear', async ({
    app,
    page,
  }) => {
    const fixture = await arrange(app);
    try {
      await openResult(page);
      await page.getByRole('button', { name: 'Edit' }).click();
      const toolbar = page.getByRole('toolbar', { name: 'Editing tools' });
      await expect(toolbar).toBeVisible();

      for (const name of ['Select', 'Crop', 'Arrow', 'Box', 'Highlight', 'Text', 'Blur']) {
        const tool = toolbar.getByRole('button', { name, exact: true });
        await tool.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(page.getByRole('tooltip').filter({ hasText: name })).toBeVisible();
      }

      const stroke = toolbar.getByRole('radiogroup', { name: 'Thickness' });
      // The group has one tab stop on the chosen button. Arrow keys reach the others.
      const medium0 = stroke.getByRole('radio', { name: 'Medium stroke' });
      await medium0.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tooltip').filter({ hasText: 'Medium stroke' })).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('tooltip').filter({ hasText: 'Small stroke' })).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tooltip').filter({ hasText: 'Thick stroke' })).toBeVisible();
      const boxes = [];
      for (const name of ['Small stroke', 'Medium stroke', 'Thick stroke']) {
        boxes.push(await stroke.getByRole('radio', { name }).boundingBox());
      }
      const [small, medium, thick] = boxes;
      if (!small || !medium || !thick) throw new Error('no boxes');
      expect(Math.abs(small.width - medium.width)).toBeLessThan(1);
      expect(Math.abs(medium.width - thick.width)).toBeLessThan(1);
      const gapA = medium.x - (small.x + small.width);
      const gapB = thick.x - (medium.x + medium.width);
      expect(Math.abs(gapA - gapB)).toBeLessThan(1);

      await stroke.getByRole('radio', { name: 'Thick stroke' }).click();
      await expect(stroke.getByRole('radio', { name: 'Thick stroke' })).toBeChecked();
      const color = await stroke
        .getByRole('radio', { name: 'Thick stroke' })
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(color).toBe('rgb(0, 78, 82)');
    } finally {
      fixture.cleanup();
    }
  });

  test('cancel with unsaved edits asks first, and the safe choice has focus', async ({
    app,
    page,
  }) => {
    const fixture = await arrange(app);
    try {
      await openResult(page);
      await page.getByRole('button', { name: 'Edit' }).click();

      // Nothing changed, so Cancel leaves at once.
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('img', { name: /Screenshot 600 by 400/ })).toBeVisible();

      await page.getByRole('button', { name: 'Edit' }).click();
      await page.keyboard.press('r');
      await drag(page, [100, 100], [200, 200]);
      await expect(status(page)).toContainText('1 mark');
      await page.getByRole('button', { name: 'Cancel' }).click();

      const dialog = page.getByRole('dialog', { name: 'Discard your edits?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(status(page)).toContainText('1 mark');

      await page.getByRole('button', { name: 'Cancel' }).click();
      await dialog.getByRole('button', { name: 'Discard edits' }).click();
      await expect(page.getByRole('img', { name: /Screenshot 600 by 400/ })).toBeVisible();
      expect(readdirSync(fixture.folder)).toEqual(['shot-test.png']);
      expect(hash(fixture.original)).toBe(fixture.originalHash);
    } finally {
      fixture.cleanup();
    }
  });

  test('deleting a screenshot asks first', async ({ app, page }) => {
    const fixture = await arrange(app);
    try {
      await openResult(page);
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete this screenshot?' });
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      expect(readdirSync(fixture.folder)).toEqual(['shot-test.png']);

      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText('Moved the screenshot to the recycle bin')).toBeVisible();
      await expect.poll(() => readdirSync(fixture.folder)).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  test('a toast has a close button and goes away by itself', async ({ app, page }) => {
    const fixture = await arrange(app);
    try {
      await openResult(page);
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      const toast = page.getByText('Copied to the clipboard', { exact: true });
      await expect(toast).toBeVisible();
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(toast).toBeHidden();

      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(toast).toBeVisible();
      await expect(toast).toBeHidden({ timeout: 6000 });
    } finally {
      fixture.cleanup();
    }
  });
});
