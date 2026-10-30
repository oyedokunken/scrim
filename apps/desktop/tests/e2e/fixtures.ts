import {
  _electron as electron,
  chromium,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '../..');
const PACKAGED = process.env['SCRIM_E2E_TARGET'] === 'packaged';

/**
 * SCRIM_E2E_TARGET picks what to launch:
 *   built      the electron-vite output run by Electron (default, needs `pnpm build`)
 *   packaged   the electron-builder output at SCRIM_PACKAGED_EXE, default release/win-unpacked.
 *
 * The packaged app ships with the Node inspect fuse off, so Playwright's Electron launcher
 * cannot attach. The packaged mode starts the executable itself and connects to its renderer
 * over the Chromium debugging port. That gives a page but no main process handle, so specs
 * that need the main process skip themselves in this mode.
 */
// A hosted runner has no GPU and no user session of its own. Software drawing keeps the app from
// crashing at start there, and the logging says what Chromium thought if it still does.
const sandboxFlags = process.env['CI'] ? ['--no-sandbox', '--disable-gpu'] : [];

/** Ends the app and its helper processes, which keep the user data folder locked on Windows. */
async function stopTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
  await new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
    setTimeout(resolve, 5000);
  });
}

async function waitForDebugPort(userDataDir: string, child: ChildProcess): Promise<number> {
  const file = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Scrim exited early with code ${child.exitCode}`);
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Scrim did not open a debugging port within 30 seconds');
}

interface Launched {
  page: Page;
  app: ElectronApplication | undefined;
  userDataDir: string;
}

/**
 * SCRIM_E2E turns on the test hook in the built app: a fake recorder on globalThis that the
 * shell tests drive. The hook is never created in a packaged app.
 */
function startBuilt(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [APP_DIR, `--user-data-dir=${userDataDir}`, ...sandboxFlags],
    env: {
      ...process.env,
      SCRIM_E2E: '1',
      ...(process.env['CI'] ? { ELECTRON_ENABLE_LOGGING: '1' } : {}),
    },
  });
}

async function closeQuietly(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // The app already quit, which is what several shell tests exercise.
  }
}

async function launchBuilt(userDataDir: string, use: (value: Launched) => Promise<void>) {
  const app = await startBuilt(userDataDir);
  // What the app printed, so a launch that dies at once explains itself in the test report.
  const output: string[] = [];
  const child = app.process();
  child.stdout?.on('data', (data: Buffer) => output.push(data.toString()));
  child.stderr?.on('data', (data: Buffer) => output.push(data.toString()));
  try {
    let page: Page;
    try {
      page = await app.firstWindow();
    } catch (error) {
      const why = error instanceof Error ? error.message : 'unknown';
      throw new Error(
        `${why}
Exit code: ${String(child.exitCode)}
What the app printed:
${output.join('').slice(-3000)}`,
        { cause: error },
      );
    }
    await page.waitForLoadState('domcontentloaded');
    await use({ page, app, userDataDir });
  } finally {
    await closeQuietly(app);
  }
}

async function launchPackaged(userDataDir: string, use: (value: Launched) => Promise<void>) {
  const exe =
    process.env['SCRIM_PACKAGED_EXE'] ?? join(APP_DIR, 'release', 'win-unpacked', 'Scrim.exe');
  const child = spawn(
    exe,
    [`--user-data-dir=${userDataDir}`, '--remote-debugging-port=0', ...sandboxFlags],
    { stdio: 'ignore' },
  );
  try {
    const port = await waitForDebugPort(userDataDir, child);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error('The packaged app exposed no browser context');
      const page = context.pages()[0] ?? (await context.waitForEvent('page'));
      await page.waitForLoadState('domcontentloaded');
      await use({ page, app: undefined, userDataDir });
    } finally {
      await browser.close();
    }
  } finally {
    await stopTree(child);
  }
}

interface Fixtures {
  launched: Launched;
  /** The Electron main process. Skips the test when the target is the packaged app. */
  app: ElectronApplication;
  page: Page;
  /** The folder this launch uses, for tests that start a second copy against the same one. */
  userDataDir: string;
  /** Starts the app again with the same user data folder, after the first one has quit. */
  relaunch: () => Promise<ElectronApplication>;
}

const removeLater: string[] = [];

/**
 * Removes folders once the app has closed. A test that deletes its temp folders while the app is
 * still running races the app, which can still hold them open, and Windows then refuses with EPERM.
 * Tests run one at a time in a worker, so one list is enough.
 */
export function removeAfterAppCloses(...paths: string[]): void {
  removeLater.push(...paths);
}

export const test = base.extend<Fixtures>({
  // A fresh user data folder per test, removed afterwards. Playwright reads the fixture
  // dependencies from the destructuring, so the empty pattern has to stay.
  // eslint-disable-next-line no-empty-pattern
  launched: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'scrim-e2e-'));
    try {
      await (PACKAGED ? launchPackaged : launchBuilt)(userDataDir, use);
    } finally {
      // The app has quit by now, so nothing holds these folders any more.
      for (const path of removeLater.splice(0)) rmSync(path, { recursive: true, force: true });
      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // Chromium's detached crash handler can hold the folder for a while on Windows. A leftover
        // temp folder is harmless and must not fail a test that already passed.
      }
    }
  },
  page: async ({ launched }, use) => {
    await use(launched.page);
  },
  userDataDir: async ({ launched }, use) => {
    await use(launched.userDataDir);
  },
  relaunch: async ({ launched }, use, testInfo) => {
    testInfo.skip(
      launched.app === undefined,
      'Needs the main process, which the packaged app hides',
    );
    const started: ElectronApplication[] = [];
    await use(async () => {
      const app = await startBuilt(launched.userDataDir);
      started.push(app);
      return app;
    });
    for (const app of started) await closeQuietly(app);
  },
  app: async ({ launched }, use, testInfo) => {
    testInfo.skip(
      launched.app === undefined,
      'Needs the main process, which the packaged app hides',
    );
    if (launched.app) await use(launched.app);
  },
});

export { expect } from '@playwright/test';

/**
 * Gets past the welcome screen, and past the camera and microphone check that follows it on a
 * first launch. Both steps end on a Continue or Get started button, and the app is behind them.
 */
export async function enterApp(page: Page): Promise<void> {
  await page.getByRole('button', { name: /get started|continue/i }).click();
  const check = page.getByRole('heading', { name: 'Check your camera and microphone' });
  if (await check.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Continue' }).click();
  }
}
