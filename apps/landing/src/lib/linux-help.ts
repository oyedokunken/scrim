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
