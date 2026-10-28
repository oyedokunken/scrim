import { expect, test } from './fixtures';

// Proves the guards come from `web-contents-created`, not from the main window factory: a window
// made by any other code path still gets them. Needs the main process, so built app only.
test('a newly created window gets the navigation, window open and webview guards', async ({
  app,
}) => {
  const created = await app.evaluate(async ({ BrowserWindow }) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    await win.loadURL('app://scrim/index.html');
    const contents = win.webContents;
    return {
      willNavigate: contents.listenerCount('will-navigate'),
      willRedirect: contents.listenerCount('will-redirect'),
      willAttachWebview: contents.listenerCount('will-attach-webview'),
      id: win.id,
    };
  });
  expect(created.willNavigate).toBeGreaterThan(0);
  expect(created.willRedirect).toBeGreaterThan(0);
  expect(created.willAttachWebview).toBeGreaterThan(0);

  const outcome = await app.evaluate(async ({ BrowserWindow }, id) => {
    const win = BrowserWindow.fromId(id);
    if (!win) throw new Error('window vanished');
    const opened: unknown = await win.webContents.executeJavaScript(
      "globalThis.open('https://example.com/') === null",
    );
    await win.webContents.executeJavaScript(
      "globalThis.location.href = 'https://example.com/'; true",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const url = win.webContents.getURL();
    const count = BrowserWindow.getAllWindows().length;
    win.destroy();
    return { opened, url, count };
  }, created.id);
  expect(outcome.opened).toBe(true);
  expect(outcome.url).toBe('app://scrim/index.html');
  expect(outcome.count).toBe(2);
});
