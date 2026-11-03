import { siteConfig } from '@/site.config';
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

/**
 * First run help for Windows. An unsigned installer gets the full SmartScreen walkthrough. A signed
 * one only needs a line, because SmartScreen can still ask for a confirmation while the app builds
 * reputation with Microsoft.
 */
export function windowsHelp(signed: boolean): readonly string[] {
  return signed
    ? [
        'Windows may still ask you to confirm while Scrim builds reputation. Choose More info, then Run anyway.',
      ]
    : [
        'Until the installer is signed, Windows SmartScreen may warn you before it runs.',
        'Choose More info, then Run anyway.',
      ];
}

/** The three systems Scrim is built for. */
export const SYSTEMS: readonly SystemInfo[] = [
  {
    os: 'windows',
    name: 'Windows',
    summary: 'An installer for 64 bit Windows 10 and 11.',
    help: windowsHelp(siteConfig.windowsSigned),
  },
  {
    os: 'macos',
    name: 'macOS',
    summary: 'A disk image for Apple Silicon and Intel Macs.',
    help: [
      'If macOS says it cannot verify the app, open System Settings, then Privacy and Security, and choose Open Anyway.',
      'The first time you record, allow Scrim under Screen Recording, and under Accessibility so cursor effects can follow your mouse.',
      'This build has had less testing than Windows. If something breaks, open an issue.',
    ],
  },
  {
    os: 'linux',
    name: 'Linux',
    summary: 'An AppImage and a deb package for 64 bit Linux.',
    help: [
      'Make the AppImage executable and run it, or install the deb package with your package manager.',
      'On X11 you get everything. On Wayland, cursor effects and auto zoom are off, because Wayland does not let apps watch the mouse. Recording itself works.',
      'This build has had less testing than Windows. If something breaks, open an issue.',
    ],
  },
];
