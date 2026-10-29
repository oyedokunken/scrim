import { chromium, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as e2e } from '../e2e/fixtures';

export { expect, enterApp } from '../e2e/fixtures';

const PACKAGED = process.env['SCRIM_E2E_TARGET'] === 'packaged';

/**
 * Stops every process that names this run's folder. Chromium starts its crash handler detached,
 * so killing the process tree leaves it behind and it keeps the user data folder locked, which
 * made the shared fixture fail on cleanup with EPERM.
 */
export function killByFolder(folder: string): void {
  if (process.platform !== 'win32') return;
  const needle = folder.replace(/'/g, "''");
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: 'ignore' },
  );
}

interface Launched {
  page: Page;
  app: undefined;
  userDataDir: string;
}

async function waitForPort(userDataDir: string): Promise<number> {
  const file = join(userDataDir, 'DevToolsActivePort');
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split(/\r?\n/)[0]);
      if (port > 0) return port;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Scrim did not open a debugging port within 30 seconds');
}

/**
 * The same specs as tests/e2e, with a packaged launcher that cleans up reliably. In built mode it
 * is the shared test object untouched.
 */
export const test: typeof e2e = PACKAGED
  ? e2e.extend<{ launched: Launched }>({
      // eslint-disable-next-line no-empty-pattern
      launched: async ({}, use) => {
        const exe = process.env['SCRIM_PACKAGED_EXE'] ?? '';
        const userDataDir = mkdtempSync(join(tmpdir(), 'scrim-e2e-'));
        const child = spawn(exe, [`--user-data-dir=${userDataDir}`, '--remote-debugging-port=0'], {
          stdio: 'ignore',
        });
        try {
          const port = await waitForPort(userDataDir);
          const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
          try {
            const context = browser.contexts()[0];
            if (!context) throw new Error('The packaged app exposed no browser context');
            const page = context.pages()[0] ?? (await context.waitForEvent('page'));
            await page.waitForLoadState('domcontentloaded');
            await use({ page, app: undefined, userDataDir });
          } finally {
            await browser.close().catch(() => undefined);
          }
        } finally {
          if (child.pid !== undefined) {
            spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
          }
          killByFolder(userDataDir);
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            rmSync(userDataDir, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
          } catch {
            // A detached crash handler can still hold the folder. A temp leftover is harmless.
          }
        }
      },
    })
  : e2e;
