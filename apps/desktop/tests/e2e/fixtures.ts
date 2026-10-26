import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '../..');

/**
 * SCRIM_E2E_TARGET picks what to launch:
 *   built      the electron-vite output run by Electron (default, needs `pnpm build`)
 *   packaged   the unpacked electron-builder output, at SCRIM_PACKAGED_EXE or release/win-unpacked
 */
function launchOptions(userDataDir: string): Parameters<typeof electron.launch>[0] {
  const flags = [`--user-data-dir=${userDataDir}`, ...(process.env['CI'] ? ['--no-sandbox'] : [])];
  if (process.env['SCRIM_E2E_TARGET'] === 'packaged') {
    return {
      executablePath:
        process.env['SCRIM_PACKAGED_EXE'] ?? join(APP_DIR, 'release', 'win-unpacked', 'Scrim.exe'),
      args: flags,
    };
  }
  return { args: [APP_DIR, ...flags] };
}

interface Fixtures {
  /** A fresh Electron app with its own empty user data folder, removed afterwards. */
  app: ElectronApplication;
  page: Page;
}

export const test = base.extend<Fixtures>({
  // Playwright reads the fixture dependencies from this destructuring, so it must stay.
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'scrim-e2e-'));
    const app = await electron.launch(launchOptions(userDataDir));
    try {
      await use(app);
    } finally {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
