import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The page sees only what the preload exposes. This is the shape the tests rely on, kept here
// because the e2e project has no DOM types for the renderer's own declarations.
interface Bridge {
  invoke(channel: string, input?: unknown): Promise<unknown>;
  on(event: string, listener: (payload: unknown) => void): () => void;
}
type WithBridge = typeof globalThis & { scrim: Bridge; __events?: unknown[] };

const DEFAULTS = {
  destinationFolder: null,
  lastSourceKind: 'display',
  cursorStyle: 'halo-ripples',
  zoomOn: true,
  zoomLevel: 1.8,
  holdAfterClickMs: 1200,
  smoothness: 0.6,
  cameraDeviceId: null,
  micDeviceId: null,
  cameraOn: false,
  micOn: false,
  frameRate: 30,
};

const call = (page: Page, channel: string, ...input: unknown[]) =>
  page.evaluate(
    async ([name, args]) => {
      try {
        const bridge = (globalThis as WithBridge).scrim;
        return {
          ok: true as const,
          value: await bridge.invoke(name, ...(args as [unknown?])),
        };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [channel, input] as const,
  );

test('the page can read its settings, and they start as the defaults', async ({ page }) => {
  expect(await call(page, 'settings:get')).toEqual({ ok: true, value: DEFAULTS });
});

test('the bridge offers only invoke and on', async ({ page }) => {
  const keys = await page.evaluate(() => Object.keys((globalThis as WithBridge).scrim).sort());
  expect(keys).toEqual(['invoke', 'on']);
});

test('a request that does not fit the contract is rejected with a plain message', async ({
  page,
}) => {
  const bad = await call(page, 'settings:set', { zoomLevel: 99 });
  expect(bad).toEqual({
    ok: false,
    message: expect.stringContaining('not in the expected form'),
  });
  expect(JSON.stringify(bad)).not.toMatch(/99|zoomLevel|Zod/i);
  // And nothing changed.
  expect(await call(page, 'settings:get')).toEqual({ ok: true, value: DEFAULTS });
});

test('a channel that does not exist is refused before it leaves the page', async ({ page }) => {
  const result = await call(page, 'settings:delete-everything');
  expect(result).toEqual({ ok: false, message: expect.stringContaining('Unknown channel') });
});

test('an extra argument is rejected', async ({ page }) => {
  const result = await call(page, 'settings:get', undefined, 'stray');
  expect(result.ok).toBe(false);
});

test('a link outside the allowlist cannot be opened, whatever the page asks', async ({ page }) => {
  const result = await call(page, 'shell:open-external', { url: 'https://example.com/' });
  expect(result.ok).toBe(false);
});

test('a file outside every known recording folder cannot be shown', async ({ page }) => {
  const result = await call(page, 'shell:show-in-folder', { path: 'C:\\Windows\\win.ini' });
  expect(result.ok).toBe(false);
});

test('a change comes back as an event the page can listen to', async ({ page }) => {
  await page.evaluate(() => {
    const probe = globalThis as WithBridge;
    probe.__events = [];
    probe.scrim.on('settings:changed', (payload) => probe.__events?.push(payload));
  });
  await call(page, 'settings:set', { cameraOn: true, zoomLevel: 2.2 });
  await expect.poll(() => page.evaluate(() => (globalThis as WithBridge).__events?.length)).toBe(1);
  const [payload] = await page.evaluate(() => (globalThis as WithBridge).__events ?? []);
  expect(payload).toEqual({ ...DEFAULTS, cameraOn: true, zoomLevel: 2.2 });
});

async function windowOf(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return page;
}

test('settings survive a restart, in a file that is valid json', async ({
  app,
  page,
  userDataDir,
  relaunch,
}) => {
  expect(await call(page, 'settings:set', { zoomLevel: 2.6, micOn: true })).toMatchObject({
    ok: true,
  });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => {
    electronApp.quit();
  });
  await closed;

  const onDisk = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) as unknown;
  expect(onDisk).toEqual({ version: 1, ...DEFAULTS, zoomLevel: 2.6, micOn: true });

  const again = await windowOf(await relaunch());
  expect(await call(again, 'settings:get')).toEqual({
    ok: true,
    value: { ...DEFAULTS, zoomLevel: 2.6, micOn: true },
  });
});

test('a corrupt settings file is moved aside and the app starts with the defaults', async ({
  app,
  userDataDir,
  relaunch,
}) => {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => {
    electronApp.quit();
  });
  await closed;

  const broken = '{ "version": 1, "zoomLevel": ';
  writeFileSync(join(userDataDir, 'settings.json'), broken);

  const again = await windowOf(await relaunch());
  expect(await call(again, 'settings:get')).toEqual({ ok: true, value: DEFAULTS });

  const aside = readdirSync(userDataDir).filter((name) =>
    name.startsWith('settings.json.invalid-'),
  );
  expect(aside).toHaveLength(1);
  expect(readFileSync(join(userDataDir, aside[0] ?? ''), 'utf8')).toBe(broken);
  expect(JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8'))).toEqual({
    version: 1,
    ...DEFAULTS,
  });
});

test('the log records the start without the home folder or the user name', async ({
  app,
  userDataDir,
}) => {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => {
    electronApp.quit();
  });
  await closed;

  const logFile = join(userDataDir, 'logs', 'scrim.log');
  await expect.poll(() => existsSync(logFile)).toBe(true);
  const text = readFileSync(logFile, 'utf8');
  expect(text).toMatch(/ info app\.start \{/);
  expect(text).not.toContain(userInfo().username);
});
