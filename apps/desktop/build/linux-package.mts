/**
 * The Linux package rules in one place, so the build config and the tests read the same values.
 *
 * File names. The website picks the installer from a release by extension and architecture
 * (apps/landing/src/lib/asset-match.ts): `.AppImage` or `.deb` for the format, and one of x64,
 * x86_64, amd64 or x86-64 in the name for 64 bit Intel. electron-builder fills `${arch}` with
 * x86_64 for the AppImage and amd64 for the deb. Both match, so the names need no override. A name
 * that carried arm64 or aarch64 would be refused for an x64 visitor, which is correct.
 */

/** Packages the deb needs at run time. The t64 names are Ubuntu 24.04 and Debian 13 renames. They come first on purpose: on 24.04 the old names are virtual packages, and apt may pick an unrelated provider such as liboss4-salsa-asound2, which lacks the sound symbols and stops the app from starting. */
export const DEB_DEPENDS: readonly string[] = [
  'libgtk-3-0t64 | libgtk-3-0',
  'libnotify4',
  'libnss3',
  'libxss1',
  // The mouse hook, uiohook-napi, links libX11, libXrandr, libXtst and libXt (read from the
  // ELF needed list of prebuilds/linux-x64/uiohook-napi.node, version 1.5.5).
  'libx11-6',
  'libxrandr2',
  'libxtst6',
  'libxt6t64 | libxt6',
  'xdg-utils',
  'libatspi2.0-0t64 | libatspi2.0-0',
  'libuuid1',
  'libsecret-1-0',
  'libasound2t64 | libasound2',
  'libgbm1',
  'libdrm2',
  'libxkbcommon0',
];

/** Not required, but they let FFmpeg use the graphics chip for H.264 (VA-API). */
export const DEB_RECOMMENDS: readonly string[] = ['libva2', 'libva-drm2'];

/** The shared libraries the mouse hook binary names, for the test that guards DEB_DEPENDS. */
export const UIOHOOK_NEEDED_LIBRARIES: readonly string[] = [
  'libX11.so.6',
  'libXrandr.so.2',
  'libXtst.so.6',
  'libXt.so.6',
];

export interface TemplateValues {
  readonly executable: string;
  readonly sanitizedProductName: string;
}

/**
 * Fills the `${name}` markers of an installer template the way electron-builder does. A marker
 * with no value is an error, so a typo cannot ship as literal text in a root script.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
    if (name === 'executable') return values.executable;
    if (name === 'sanitizedProductName') return values.sanitizedProductName;
    throw new Error(`The template uses an unknown value: ${name}`);
  });
}

/** The flags that switch the Chromium sandbox off. Scrim must never ship with one. */
export const SANDBOX_OFF_FLAGS: readonly string[] = ['--no-sandbox', '--disable-setuid-sandbox'];
