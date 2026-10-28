import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { windowIconPath } from '../app-icon';
import { SECURE_WEB_PREFERENCES } from '../security';

/**
 * `app` windows show in the taskbar. `helper` windows (the region selector, the cursor overlay
 * and the hidden recorder) never do, so the default Electron icon cannot show for them.
 */
export type WindowKind = 'app' | 'helper';

/** The options every window gets: the app icon, the security baseline and the taskbar rule. */
export function buildWindowOptions(
  options: BrowserWindowConstructorOptions,
  kind: WindowKind,
  platform: NodeJS.Platform,
  appPath: string,
): BrowserWindowConstructorOptions {
  const icon = windowIconPath(platform, appPath);
  return {
    ...options,
    ...(icon === undefined ? {} : { icon }),
    ...(kind === 'helper' ? { skipTaskbar: true } : {}),
    // Last, so a caller cannot weaken the baseline.
    webPreferences: { ...options.webPreferences, ...SECURE_WEB_PREFERENCES },
  };
}

/** The only place a BrowserWindow is created. A lint rule and a test keep it that way. */
export function createAppWindow(
  options: BrowserWindowConstructorOptions = {},
  kind: WindowKind = 'app',
): BrowserWindow {
  return new BrowserWindow(buildWindowOptions(options, kind, process.platform, app.getAppPath()));
}
