import { join } from 'node:path';

/**
 * The window icon for a platform, relative to resources/icons, or undefined where the system
 * takes the icon from the app bundle (macOS). Windows reads the multi size ico. Linux has no
 * bundle, so it gets the largest png.
 */
export function windowIconFile(platform: NodeJS.Platform): string | undefined {
  if (platform === 'win32') return 'icon.ico';
  if (platform === 'darwin') return undefined;
  return join('linux', '256x256.png');
}

/** The absolute window icon path, or undefined when the platform does not set one. */
export function windowIconPath(platform: NodeJS.Platform, appPath: string): string | undefined {
  const file = windowIconFile(platform);
  return file === undefined ? undefined : join(appPath, 'resources', 'icons', file);
}

/** The dock icon used while developing on macOS, drawn with the padding macOS expects. */
export function devDockIconPath(appPath: string): string {
  return join(appPath, 'resources', 'icons', 'icon-mac-512.png');
}

/** The icon shown in message boxes on Windows and Linux. macOS shows the app icon by itself. */
export function dialogIconPath(platform: NodeJS.Platform, appPath: string): string | undefined {
  return platform === 'darwin'
    ? undefined
    : join(appPath, 'resources', 'icons', 'linux', '256x256.png');
}
