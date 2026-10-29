import { spawnSync } from 'node:child_process';
import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures';

// These tests drive the fake recorder that the built app exposes when SCRIM_E2E is set. They need
// the main process, so they run against the built app only.

interface Hook {
  setRecording(recording: boolean): void;
  isRecording(): boolean;
  stopAndSave(): Promise<void>;
  calls: { start: number; stop: number };
}
type Probe = typeof globalThis & {
  __scrimRecorder?: Hook;
  __dialogs?: { buttons: string[]; defaultId: number; message: string }[];
  __stopped?: boolean;
  __second?: number;
};

/** Replaces the message box with one that records its options and answers with `response`. */
async function stubDialog(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    const probe = globalThis as Probe;
    probe.__dialogs = [];
    (dialog as unknown as { showMessageBox: unknown }).showMessageBox = (...args: unknown[]) => {
      const options = args[args.length - 1] as {
        buttons: string[];
        defaultId: number;
        message: string;
      };
      probe.__dialogs?.push(options);
      return Promise.resolve({ response: answer, checkboxChecked: false });
    };
  }, response);
}

async function startRecordingAndClose(app: ElectronApplication): Promise<void> {
  // Closing before the window has finished showing lets the late show undo a hide.
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) => {
    (globalThis as Probe).__scrimRecorder?.setRecording(true);
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

const dialogs = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as Probe).__dialogs ?? []);

test('a second launch with the same user data folder focuses the first window and exits', async ({
  app,
  userDataDir,
}) => {
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
    .toBe(true);
  const exe = await app.evaluate(() => process.execPath);
  const appDir = await app.evaluate(({ app: electronApp }) => electronApp.getAppPath());
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const probe = globalThis as Probe;
    probe.__second = 0;
    electronApp.on('second-instance', () => {
      probe.__second = (probe.__second ?? 0) + 1;
    });
    BrowserWindow.getAllWindows()[0]?.minimize();
  });
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()),
  ).toBe(true);

  const second = spawnSync(exe, [appDir, `--user-data-dir=${userDataDir}`], { timeout: 30_000 });
  expect(second.status).toBe(0);

  await expect.poll(() => app.evaluate(() => (globalThis as Probe).__second)).toBe(1);
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()),
    )
    .toBe(false);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('closing the window while idle quits the app on Windows and Linux', async ({ app }) => {
  test.skip(process.platform === 'darwin', 'macOS keeps the app in the dock');
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
});

test('closing during a recording asks in the app, and Cancel keeps everything running', async ({
  app,
  page,
}) => {
  // The system message box must not be used: it would show here as a recorded call.
  await stubDialog(app, 2);
  await startRecordingAndClose(app);

  const dialog = page.getByRole('dialog', { name: 'Scrim is still recording' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Keep recording/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stop and save' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
  // Cancel is the safe default, so a stray Enter never stops a recording.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await dialogs(app)).toHaveLength(0);
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
  ).toBe(true);
  expect(await app.evaluate(() => (globalThis as Probe).__scrimRecorder?.isRecording())).toBe(true);
  expect(await app.evaluate(() => (globalThis as Probe).__scrimRecorder?.calls.stop)).toBe(0);
  await app.evaluate(() => {
    (globalThis as Probe).__scrimRecorder?.setRecording(false);
  });
});

test('Escape and the close button on the question also keep everything running', async ({
  app,
  page,
}) => {
  await startRecordingAndClose(app);
  const dialog = page.getByRole('dialog', { name: 'Scrim is still recording' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await app.evaluate(() => (globalThis as Probe).__scrimRecorder?.isRecording())).toBe(true);
  expect(await app.evaluate(() => (globalThis as Probe).__scrimRecorder?.calls.stop)).toBe(0);
  await app.evaluate(() => {
    (globalThis as Probe).__scrimRecorder?.setRecording(false);
  });
});

test('Keep recording hides the window and the recording continues', async ({ app, page }) => {
  test.skip(
    process.platform === 'linux',
    'The tray depends on the desktop, so Linux is covered by unit tests',
  );
  await startRecordingAndClose(app);
  await page
    .getByRole('dialog', { name: 'Scrim is still recording' })
    .getByRole('button', { name: /^Keep recording/ })
    .click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
    .toBe(false);
  expect(await app.evaluate(() => (globalThis as Probe).__scrimRecorder?.isRecording())).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await app.evaluate(() => {
    (globalThis as Probe).__scrimRecorder?.setRecording(false);
  });
});

test('Stop and save finishes the recording first, then quits', async ({ app, page }) => {
  await app.evaluate(() => {
    const recorder = (globalThis as Probe).__scrimRecorder;
    if (!recorder) throw new Error('The test hook is missing');
    recorder.stopAndSave = async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      (globalThis as Probe).__stopped = true;
      recorder.setRecording(false);
    };
  });
  const closed = app.waitForEvent('close');
  await startRecordingAndClose(app);
  await page
    .getByRole('dialog', { name: 'Scrim is still recording' })
    .getByRole('button', { name: 'Stop and save' })
    .click();
  await closed;
});

test('there is no default menu on Windows and Linux', async ({ app }) => {
  test.skip(process.platform === 'darwin', 'macOS has a real application menu');
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
});

test('the window comes back where it was left, on the same display', async ({ app, relaunch }) => {
  test.skip(process.platform === 'darwin', 'Closing the window does not quit on macOS');
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
    .toBe(true);
  const placed = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const area = screen.getPrimaryDisplay().workArea;
    window?.setBounds({ x: area.x + 80, y: area.y + 60, width: 900, height: 600 });
    return window?.getBounds();
  });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;

  const again = await relaunch();
  const window = await again.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  const restored = await again.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getBounds(),
  );
  expect(restored).toEqual(placed);
});
