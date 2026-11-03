/**
 * How this copy of the app updates, decided from facts only so a test can cover every system.
 *
 * - `auto`: electron-updater downloads and installs (Windows, macOS, a Linux AppImage).
 * - `notice`: a deb package. electron-updater's deb path installs with dpkg as root and falls back
 *   to an unauthenticated install, so Scrim does not use it. The app checks for a newer version and
 *   shows a link to the release page, and the person installs the new deb themselves.
 * - `unsupported`: a copy run from source, which has no installed app to update.
 */
export type UpdateMode = 'auto' | 'notice' | 'unsupported';

export function updateModeFor(input: {
  platform: string;
  isPackaged: boolean;
  env: Readonly<Record<string, string | undefined>>;
  /** True when an end to end test points a development run at a local feed. */
  hasTestFeed: boolean;
}): UpdateMode {
  if (!input.isPackaged && !input.hasTestFeed) return 'unsupported';
  // An AppImage sets APPIMAGE to its own path. A Linux copy without it is the deb package.
  if (input.platform === 'linux' && input.env['APPIMAGE'] === undefined && !input.hasTestFeed) {
    return 'notice';
  }
  return 'auto';
}
