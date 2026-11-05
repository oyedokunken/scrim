/**
 * The commands in the Linux help, kept as plain data so the page and the tests read one copy. None
 * of them turns the Chromium sandbox off. Scrim never runs without it.
 */

/** Makes the downloaded AppImage runnable. */
export const APPIMAGE_RUN_COMMANDS = [
  'chmod +x Scrim-*-linux-*.AppImage',
  './Scrim-*-linux-*.AppImage',
];

/**
 * Ubuntu 24.04 lets only programs with an AppArmor profile create the user namespaces that the
 * sandbox uses. The deb installs such a profile for Scrim. An AppImage runs from a temporary mount,
 * so a profile that names it is not reliable, and the system setting below is the switch that is known to work.
 */
export const APPIMAGE_SANDBOX_COMMANDS = {
  /** Lasts until the next restart. */
  now: 'sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0',
  /** Keeps the setting after a restart. */
  keep: "echo 'kernel.apparmor_restrict_unprivileged_userns=0' | sudo tee /etc/sysctl.d/60-scrim-userns.conf",
  /** Puts Ubuntu's protection back. */
  undo: 'sudo rm /etc/sysctl.d/60-scrim-userns.conf && sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=1',
} as const;

/**
 * The Scrim only way to run an AppImage on Ubuntu 24.04. It is the same profile the deb installs,
 * pointed at a fixed folder. An AppImage normally runs from a temporary mount whose name changes
 * on every start, so a profile cannot name it. Extracting the AppImage once gives Scrim a stable
 * path, and the profile allows user namespaces for that one program and nothing else.
 */
export const APPIMAGE_PROFILE_FOLDER = '/opt/Scrim-appimage';
export const APPIMAGE_PROFILE_FILE = '/etc/apparmor.d/scrim-appimage';

export const APPIMAGE_PROFILE_COMMANDS = {
  /** Unpacks the AppImage next to the download, then moves it to the fixed folder. */
  extract: [
    './Scrim-*-linux-*.AppImage --appimage-extract',
    `sudo mv squashfs-root ${APPIMAGE_PROFILE_FOLDER}`,
  ],
  /** Writes the profile. The profile text is the same as the one inside the deb. */
  write: [
    `sudo tee ${APPIMAGE_PROFILE_FILE} > /dev/null <<'EOF'`,
    'abi <abi/4.0>,',
    'include <tunables/global>',
    '',
    `profile scrim-appimage ${APPIMAGE_PROFILE_FOLDER}/scrim flags=(unconfined) {`,
    '  userns,',
    '',
    '  include if exists <local/scrim-appimage>',
    '}',
    'EOF',
  ],
  /** Loads the profile now. It loads again by itself after a restart. */
  load: `sudo apparmor_parser -r ${APPIMAGE_PROFILE_FILE}`,
  /** Starts Scrim. */
  run: `${APPIMAGE_PROFILE_FOLDER}/scrim`,
  /** Takes everything back out. */
  remove: [
    `sudo apparmor_parser -R ${APPIMAGE_PROFILE_FILE}`,
    `sudo rm ${APPIMAGE_PROFILE_FILE}`,
    `sudo rm -r ${APPIMAGE_PROFILE_FOLDER}`,
  ],
} as const;

/** The two commands that check a download against the published key. */
export function verifyCommands(): readonly [string, string] {
  return ['gpg --import scrim-release-key.asc', 'gpg --verify <file>.asc <file>'];
}

/** The fingerprint in groups of four for reading aloud, or an empty string when none is set. */
export function spacedFingerprint(fingerprint: string): string {
  const clean = fingerprint.replaceAll(' ', '').toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(clean)) {
    return '';
  }
  return (clean.match(/.{4}/g) ?? []).join(' ');
}
