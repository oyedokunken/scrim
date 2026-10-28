import type { Os } from './platform';

type SupportedOs = Exclude<Os, 'unsupported'>;

export interface SystemInfo {
  os: SupportedOs;
  name: string;
  /** False while there is no installer for this system. It then shows Coming soon. */
  available: boolean;
  /** What the download is. */
  summary: string;
  /** First run help, one paragraph each. */
  help: readonly string[];
}

/** The three systems Scrim is planned for. Only Windows has an installer in version 1. */
export const SYSTEMS: readonly SystemInfo[] = [
  {
    os: 'windows',
    name: 'Windows',
    available: true,
    summary: 'An installer for 64 bit Windows 10 and 11.',
    help: [
      'Until the installer is signed, Windows SmartScreen may warn you before it runs.',
      'Choose More info, then Run anyway.',
    ],
  },
  {
    os: 'macos',
    name: 'macOS',
    available: false,
    summary: 'Leave your email and we will tell you when it is ready.',
    help: [
      'There is no Mac version yet, so there is nothing to install.',
      'Tick the box to get one email when a new version is out.',
    ],
  },
  {
    os: 'linux',
    name: 'Linux',
    available: false,
    summary: 'Leave your email and we will tell you when it is ready.',
    help: [
      'There is no Linux version yet, so there is nothing to install.',
      'Tick the box to get one email when a new version is out.',
    ],
  },
];
