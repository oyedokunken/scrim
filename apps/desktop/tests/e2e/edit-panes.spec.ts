import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { enterApp, expect, removeAfterAppCloses, test } from './fixtures';

/**
 * Edit in the two places it lives: the Library detail and the page after a recording, and the
 * screenshot editor. A recording is edited with Background, Cursor and Zoom only. A screenshot keeps
 * its tools and gains a background. Both can use the person's own image. It needs `pnpm build` first.
 */
const ffmpeg = process.env['SCRIM_FFMPEG'] ?? 'ffmpeg';
const SHOTS = process.env['SCRIM_SHOTS'];

test.skip(process.env['SCRIM_E2E_TARGET'] === 'packaged', 'Needs the main process.');

const ORANGE: [number, number, number] = [0xe0, 0x60, 0x20];

function make(args: string[]): void {
  const run = spawnSync(ffmpeg, ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
}

const hash = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

/** A PNG of one flat colour. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The colour of one pixel of a picture or a video frame, read back with FFmpeg. */
function pixelOf(file: string, x: number, y: number, seconds = 0.5): [number, number, number] {
  const out = execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `format=rgb24,crop=1:1:${String(x)}:${String(y)}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: 1024 },
  );
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

const near = (actual: number, wanted: number, slack = 40): boolean =>
  Math.abs(actual - wanted) <= slack;
const isOrange = (rgb: [number, number, number]): boolean =>
  near(rgb[0], ORANGE[0]) && near(rgb[1], ORANGE[1]) && near(rgb[2], ORANGE[2]);

/** Answers the system file dialog with one file, the way a person picking it would. */
async function pickWith(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] });
  }, file);
}

async function resize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.setContentSize(size.width, size.height);
      }
    },
    { width, height },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

interface Recording {
  root: string;
  videos: string;
  folder: string;
  image: string;
  screenHash: string;
  cleanup: () => void;
}

/** One finished recording in the projects folder, its screen track made with FFmpeg, and an orange picture to pick. */
async function arrangeRecording(app: ElectronApplication): Promise<Recording> {
  const root = mkdtempSync(join(tmpdir(), 'scrim-edit-'));
  const videos = join(root, 'videos');
  const pictures = join(root, 'pictures');
  const local = join(root, 'local');
  const folder = join(local, 'Scrim', 'Projects', 'Take 1.scrim');
  mkdirSync(join(videos, 'Scrim'), { recursive: true });
  mkdirSync(pictures, { recursive: true });
  mkdirSync(folder, { recursive: true });
  make([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30',
    '-t',
    '4',
    '-c:v',
    'libvpx',
    '-b:v',
    '1M',
    join(folder, 'screen.webm'),
  ]);
  make([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=30',
    '-t',
    '4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    join(folder, 'screen.mp4'),
  ]);
  writeFileSync(
    join(folder, 'session.json'),
    JSON.stringify({
      version: 1,
      id: '6f1c2f4e-3b3a-4c53-9a0e-0a5a0b6a1e11',
      name: 'Take 1',
      createdAt: '2026-11-02T10:00:00.000Z',
      app: { version: '0.0.0', os: 'windows', arch: 'x64' },
      pid: 4242,
      source: {
        kind: 'display',
        origin: { x: 0, y: 0 },
        scaleFactor: 1,
        frame: { width: 1280, height: 720 },
      },
      capture: { cursorInCapture: true },
      tracks: [
        {
          kind: 'screen',
          file: 'screen.webm',
          mimeType: 'video/webm',
          startedAt: 100,
          bytesWritten: 1000,
          complete: true,
          stoppedAt: 4100,
        },
      ],
      clock: { rendererOffsetMs: 0, uncertaintyMs: 1 },
      pauses: [],
      input: { status: 'unavailable', reason: 'error' },
      warnings: [],
      heartbeatAt: '2026-11-02T10:00:04.000Z',
      heartbeatElapsedMs: 4100,
      cleanClose: true,
    }),
  );
  const image = join(root, 'orange.png');
  writeFileSync(image, solidPng(320, 180, ORANGE));
  await app.evaluate(
    ({ app: electronApp }, args) => {
      electronApp.setPath('pictures', args.pictures);
      electronApp.setPath('videos', args.videos);
      process.env['LOCALAPPDATA'] = args.local;
    },
    { pictures, videos, local },
  );
  return {
    root,
    videos: join(videos, 'Scrim'),
    folder,
    image,
    screenHash: hash(join(folder, 'screen.webm')),
    cleanup: () => {
      removeAfterAppCloses(root);
    },
  };
}

const sections = (page: Page) =>
  page.getByRole('radiogroup', { name: 'What to edit' }).getByRole('radio');

/** The colour at the top left corner of the live preview, which is the background when there is one. */
async function liveCorner(page: Page): Promise<[number, number, number]> {
  // The canvas is drawn from video on another origin, so it cannot be read back by script. The
  // picture of the element, taken by the browser itself, can.
  const file = join(tmpdir(), `scrim-live-${String(process.pid)}.png`);
  await page.getByTestId('live-preview').screenshot({ path: file });
  return pixelOf(file, 18, 18, 0);
}

const mp4s = (folder: string): string[] =>
  readdirSync(folder).filter((name) => name.endsWith('.mp4'));

test.describe('edit a recording', () => {
  test('the Library detail edits Background, Cursor and Zoom, with your own image, and saves a new or a replaced video', async ({
    app,
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await arrangeRecording(app);
    try {
      await page.evaluate(() => {
        const store: string[] = [];
        (globalThis as unknown as { __violations: string[] }).__violations = store;
        document.addEventListener('securitypolicyviolation', (event) => {
          store.push(event.violatedDirective);
        });
      });
      await enterApp(page);
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await page.getByRole('button', { name: 'Open Take 1' }).click({ position: { x: 8, y: 8 } });
      const detail = page.getByRole('region', { name: /Details for Take 1/ });
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Edit' }).click();

      const pane = page.getByRole('region', { name: 'Edit Take 1' });
      await expect(pane).toBeVisible();
      // Exactly three things to edit, and nothing from the old editor.
      await expect(sections(page)).toHaveText(['Background', 'Cursor', 'Zoom']);
      await expect(pane.getByRole('button', { name: /Trim|Cut|Text|Camera/ })).toHaveCount(0);
      const canvas = page.getByTestId('live-preview');
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('data-bubble', 'false');
      await expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled();

      for (const [w, h] of [
        [1100, 700],
        [1920, 1080],
      ] as const) {
        await resize(app, w, h);
        await expect(pane.getByRole('button', { name: 'Save' })).toBeVisible();
        await shot(page, `edit-library-${String(w)}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      }

      // The preview shows the deep green preset behind the recording, and None removes it.
      await expect
        .poll(async () => {
          const [r, g, b] = await liveCorner(page);
          return g - r > 40 && b - r > 40;
        })
        .toBe(true);
      await pane
        .getByRole('radiogroup', { name: 'Background' })
        .getByRole('radio', { name: 'None' })
        .click();
      await expect
        .poll(async () => {
          const [r, g, b] = await liveCorner(page);
          return g - r > 40 && b - r > 40;
        })
        .toBe(false);

      // Your own image: pick a file, it becomes a tile, it is selected, and the preview shows it.
      await pickWith(app, fixture.image);
      await pane.getByRole('button', { name: 'Add your own image' }).click();
      const tile = pane.getByRole('radio', { name: /Your image orange/ });
      await expect(tile).toBeVisible();
      await expect(tile).toBeChecked();
      await expect.poll(async () => isOrange(await liveCorner(page))).toBe(true);
      await shot(page, 'edit-library-own-image');

      // A wrong file is refused with a reason, and the tile list does not change.
      const notAnImage = join(fixture.root, 'fake.png');
      writeFileSync(notAnImage, 'MZ this is not a picture');
      await pickWith(app, notAnImage);
      await pane.getByRole('button', { name: 'Add your own image' }).click();
      await expect(pane.getByRole('alert')).toContainText('Choose a PNG, JPG or WebP image.');
      await expect(pane.getByRole('radio', { name: /Your image/ })).toHaveCount(1);

      // The picture is copied into Scrim's own data folder and not linked to the original.
      const userData = await app.evaluate(({ app: electronApp }) =>
        electronApp.getPath('userData'),
      );
      const kept = readdirSync(join(userData, 'backgrounds')).filter((name) =>
        name.endsWith('.png'),
      );
      expect(kept).toHaveLength(1);
      expect(hash(join(userData, 'backgrounds', kept[0] ?? ''))).toBe(hash(fixture.image));

      // Cursor and Zoom.
      await sections(page).filter({ hasText: 'Cursor' }).click();
      await pane.getByRole('button', { name: 'Halo only' }).click();
      await sections(page).filter({ hasText: 'Zoom' }).click();
      await pane.getByRole('button', { name: /Strong/ }).click();
      await shot(page, 'edit-library-zoom');
      await sections(page).filter({ hasText: 'Background' }).click();

      // Save as a new video: a second file next to the first is not made yet, so there is one.
      await pane.getByRole('button', { name: 'Save' }).click();
      const choice = page.getByRole('dialog', { name: 'Make the video again?' });
      await expect(choice.getByRole('button', { name: 'Save as a new video' })).toBeVisible();
      await expect(choice.getByRole('button', { name: 'Replace the video' })).toBeVisible();
      await shot(page, 'edit-save-choice');
      await choice.getByRole('button', { name: 'Save as a new video' }).click();
      await expect(page.getByRole('region', { name: /Details for Take 1/ })).toBeVisible({
        timeout: 120_000,
      });
      await expect.poll(() => mp4s(fixture.videos)).toHaveLength(1);
      const first = join(fixture.videos, mp4s(fixture.videos)[0] ?? '');
      // The saved video has the person's picture around the recording.
      expect(isOrange(pixelOf(first, 4, 4))).toBe(true);
      // The original recording is exactly as it was.
      expect(hash(join(fixture.folder, 'screen.webm'))).toBe(fixture.screenHash);
      const firstTime = statSync(first).mtimeMs;

      // Edit again and save as a new one: the first video stays and a second appears.
      await detail.getByRole('button', { name: 'Edit' }).click();
      await sections(page).filter({ hasText: 'Cursor' }).click();
      await page
        .getByRole('region', { name: 'Edit Take 1' })
        .getByRole('button', { name: 'Off' })
        .click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page
        .getByRole('dialog', { name: 'Make the video again?' })
        .getByRole('button', { name: 'Save as a new video' })
        .click();
      await expect.poll(() => mp4s(fixture.videos).length, { timeout: 120_000 }).toBe(2);
      expect(statSync(first).mtimeMs).toBe(firstTime);
      const second = join(
        fixture.videos,
        mp4s(fixture.videos).find((name) => join(fixture.videos, name) !== first) ?? '',
      );
      const secondTime = statSync(second).mtimeMs;

      // Replace: still two files, and the original name was written again.
      await page
        .getByRole('region', { name: /Details for Take 1/ })
        .getByRole('button', { name: 'Edit' })
        .click();
      await sections(page).filter({ hasText: 'Zoom' }).click();
      await page
        .getByRole('region', { name: 'Edit Take 1' })
        .getByRole('button', { name: /Subtle/ })
        .click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page
        .getByRole('dialog', { name: 'Make the video again?' })
        .getByRole('button', { name: 'Replace the video' })
        .click();
      await expect(page.getByRole('region', { name: /Details for Take 1/ })).toBeVisible({
        timeout: 120_000,
      });
      expect(mp4s(fixture.videos)).toHaveLength(2);
      // The replace wrote over the video Scrim made last, and left the other one alone.
      await expect.poll(() => statSync(second).mtimeMs).toBeGreaterThan(secondTime);
      expect(statSync(first).mtimeMs).toBe(firstTime);
      expect(hash(join(fixture.folder, 'screen.webm'))).toBe(fixture.screenHash);

      expect(
        await page.evaluate(
          () => (globalThis as unknown as { __violations: string[] }).__violations,
        ),
      ).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  test('your own image can be removed after a confirmation, and the tile goes away', async ({
    app,
    page,
  }) => {
    const fixture = await arrangeRecording(app);
    try {
      await enterApp(page);
      await page.getByRole('button', { name: 'Background', exact: true }).click();
      await pickWith(app, fixture.image);
      await page.getByRole('button', { name: 'Add your own image' }).click();
      const tile = page.getByRole('radio', { name: /Your image orange/ });
      await expect(tile).toBeChecked();
      await page.getByRole('button', { name: 'Remove this image' }).click();
      const confirm = page.getByRole('dialog', { name: 'Remove this image?' });
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(tile).toBeVisible();
      await page.getByRole('button', { name: 'Remove this image' }).click();
      await confirm.getByRole('button', { name: 'Remove image' }).click();
      await expect(tile).toHaveCount(0);
      const userData = await app.evaluate(({ app: electronApp }) =>
        electronApp.getPath('userData'),
      );
      expect(readdirSync(join(userData, 'backgrounds')).filter((n) => n.endsWith('.png'))).toEqual(
        [],
      );
      // The person's original file is still there.
      expect(existsSync(fixture.image)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  test('the page after a recording has Edit, with the same three things', async ({ app, page }) => {
    const fixture = await arrangeRecording(app);
    try {
      await enterApp(page);
      await app.evaluate(
        ({ BrowserWindow }, payload) => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send('recording:finished', payload);
          }
        },
        {
          folder: fixture.folder,
          name: 'Take 1',
          files: [{ kind: 'screen', path: join(fixture.folder, 'screen.webm') }],
          durationMs: 4000,
          bytes: 4096,
          recovered: false,
          warnings: [],
        },
      );
      await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open in editor' })).toHaveCount(0);
      await page
        .getByRole('group', { name: 'What to do next' })
        .getByRole('button', { name: 'Edit' })
        .click();
      const pane = page.getByRole('region', { name: /^Edit / });
      await expect(pane).toBeVisible();
      await expect(sections(page)).toHaveText(['Background', 'Cursor', 'Zoom']);
      await expect(page.getByTestId('live-preview')).toBeVisible();
      await shot(page, 'edit-review-1100');
      await pane.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('heading', { name: 'Review your recording' })).toBeVisible();
    } finally {
      fixture.cleanup();
    }
  });
});

test.describe('edit a screenshot', () => {
  const WIDTH = 600;
  const HEIGHT = 400;

  test('Background around the screenshot, with a preset and your own image, saves a new file and leaves the original alone', async ({
    app,
    page,
  }) => {
    test.setTimeout(90_000);
    const root = mkdtempSync(join(tmpdir(), 'scrim-shot-bg-'));
    const folder = join(root, 'Scrim');
    mkdirSync(folder, { recursive: true });
    const original = join(folder, 'shot-test.png');
    writeFileSync(original, solidPng(WIDTH, HEIGHT, [235, 230, 220]));
    const image = join(root, 'orange.png');
    writeFileSync(image, solidPng(320, 180, ORANGE));
    const originalHash = hash(original);
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
    try {
      await enterApp(page);
      await page.getByRole('button', { name: 'Screenshot', exact: true }).click();
      await page.getByRole('main').getByRole('button', { name: 'Take screenshot' }).click();
      await expect(page.getByRole('img', { name: /Screenshot 600 by 400/ })).toBeVisible();
      await page.getByRole('button', { name: 'Edit' }).click();
      const toolbar = page.getByRole('toolbar', { name: 'Editing tools' });
      // The tools are still all there.
      for (const name of ['Crop', 'Arrow', 'Box', 'Highlight', 'Text', 'Blur']) {
        await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
      }
      // Nothing about cursor or zoom for a still picture.
      await toolbar.getByRole('button', { name: 'Background' }).click();
      const panel = page.getByRole('complementary', { name: 'Background' });
      await expect(panel).toBeVisible();
      await expect(page.getByText(/Cursor style|Auto zoom/)).toHaveCount(0);
      for (const [w, h] of [
        [1100, 700],
        [1920, 1080],
      ] as const) {
        await resize(app, w, h);
        await expect(panel).toBeVisible();
        await shot(page, `edit-shot-${String(w)}`);
      }

      await panel.getByRole('radio', { name: 'Dots' }).click();
      await panel.getByRole('radio', { name: 'Large' }).click();
      await expect(page.locator('canvas.shot-canvas')).toBeVisible();

      await pickWith(app, image);
      await panel.getByRole('button', { name: 'Add your own image' }).click();
      await expect(panel.getByRole('radio', { name: /Your image orange/ })).toBeChecked();
      await panel.getByRole('radio', { name: 'Medium' }).click();
      await shot(page, 'edit-shot-own-image');

      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByText(/Saved shot-test-edited\.png/)).toBeVisible();
      const files = readdirSync(folder).sort();
      expect(files).toEqual(['shot-test-edited.png', 'shot-test.png']);
      const edited = join(folder, 'shot-test-edited.png');
      const png = readFileSync(edited);
      // Medium padding is 6 percent of the shorter side, on every side: 24 pixels.
      expect(png.readUInt32BE(16)).toBe(WIDTH + 48);
      expect(png.readUInt32BE(20)).toBe(HEIGHT + 48);
      // The corner is the person's picture, and the middle is still the screenshot.
      expect(isOrange(pixelOf(edited, 3, 3, 0))).toBe(true);
      const middle = pixelOf(edited, 300, 220, 0);
      expect(near(middle[0], 235, 6) && near(middle[1], 230, 6) && near(middle[2], 220, 6)).toBe(
        true,
      );
      // The original is exactly as it was.
      expect(hash(original)).toBe(originalHash);
    } finally {
      removeAfterAppCloses(root);
    }
  });
});
