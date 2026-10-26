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
const sandboxFlags = process.env['CI'] ? ['--no-sandbox'] : [];

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
}

async function launchBuilt(userDataDir: string, use: (value: Launched) => Promise<void>) {
  const app = await electron.launch({
    args: [APP_DIR, `--user-data-dir=${userDataDir}`, ...sandboxFlags],
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use({ page, app });
  } finally {
    await app.close();
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
      await use({ page, app: undefined });
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
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
  page: async ({ launched }, use) => {
    await use(launched.page);
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
