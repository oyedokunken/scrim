import type { Os } from './platform';

type SupportedOs = Exclude<Os, 'unsupported'>;

export interface SystemInfo {
  os: SupportedOs;
  name: string;
  /** What the download is. */
  summary: string;
  /** First run help, one paragraph each. */
  help: readonly string[];
}

/** The three systems Scrim runs on, with the help people need on first run. */
export const SYSTEMS: readonly SystemInfo[] = [
  {
    os: 'windows',
    name: 'Windows',
    summary: 'An installer for Windows.',
    help: [
      'Until the installer is signed, Windows SmartScreen may warn you before it runs.',
      'Choose More info, then Run anyway.',
    ],
  },
  {
    os: 'macos',
    name: 'macOS',
    summary: 'An app for macOS, for Apple Silicon and Intel Macs.',
    help: [
      'Until the app is notarized, open System Settings, then Privacy and Security, and choose Open Anyway.',
      'Your first recording needs the Screen Recording permission. Cursor effects and auto zoom need the Accessibility or Input Monitoring permission.',
    ],
  },
  {
    os: 'linux',
    name: 'Linux',
    summary: 'An AppImage and a deb package.',
    help: [
      'Cursor effects and auto zoom need an X11 session.',
      'On Wayland, recording works but those effects are off, and Scrim tells you why.',
    ],
  },
];
