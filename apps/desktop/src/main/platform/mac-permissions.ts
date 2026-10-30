type MediaAccess = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export interface MacPermissionDeps {
  /** `systemPreferences.getMediaAccessStatus`. */
  mediaAccess: (kind: 'screen' | 'camera' | 'microphone') => string;
  /** `systemPreferences.isTrustedAccessibilityClient(false)`, which never prompts. */
  accessibilityTrusted: () => boolean;
}

export interface MacPermissions {
  screen: MediaAccess;
  camera: MediaAccess;
  microphone: MediaAccess;
  /** Needed for the mouse hook, so for cursor effects and auto zoom. */
  accessibility: boolean;
}

function normalize(value: string): MediaAccess {
  switch (value) {
    case 'not-determined':
    case 'granted':
    case 'denied':
    case 'restricted':
      return value;
    default:
      return 'unknown';
  }
}

/** A snapshot of the four macOS permissions Scrim cares about. It never triggers a prompt. */
export function readMacPermissions(deps: MacPermissionDeps): MacPermissions {
  return {
    screen: normalize(deps.mediaAccess('screen')),
    camera: normalize(deps.mediaAccess('camera')),
    microphone: normalize(deps.mediaAccess('microphone')),
    accessibility: deps.accessibilityTrusted(),
  };
}

/** Deep links into System Settings, one per permission. */
export const MAC_SETTINGS_URLS = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
} as const;

export interface MacPermissionStep {
  permission: 'screen' | 'accessibility';
  /** Whether recording can work without it. Screen Recording cannot, Accessibility can. */
  required: boolean;
  granted: boolean;
  title: string;
  /** Plain words for what to do, including the restart macOS asks for. */
  help: string;
}

/**
 * The steps for the first run guide on a Mac. Screen Recording is required: without it macOS
 * hands back a blank desktop. Accessibility is optional: without it the recording works and the
 * cursor effects and auto zoom stay off. macOS only applies a newly granted Screen Recording
 * permission after the app restarts, so the help says so.
 */
export function macPermissionSteps(permissions: MacPermissions): MacPermissionStep[] {
  return [
    {
      permission: 'screen',
      required: true,
      granted: permissions.screen === 'granted',
      title: 'Screen Recording',
      help:
        permissions.screen === 'restricted'
          ? 'This Mac blocks screen recording for this account. Ask whoever manages the Mac.'
          : 'Open System Settings, Privacy and Security, Screen Recording, turn Scrim on, then quit and open Scrim again. macOS applies the change after a restart of the app.',
    },
    {
      permission: 'accessibility',
      required: false,
      granted: permissions.accessibility,
      title: 'Accessibility',
      help: 'Optional. Turn Scrim on in Privacy and Security, Accessibility, so Scrim can see the mouse. Without it recordings work, but cursor effects and auto zoom stay off.',
    },
  ];
}

/**
 * Opens one pane of System Settings. The caller passes a permission name, never a URL, so the
 * renderer cannot use this to open anything else. Does nothing off macOS.
 */
export async function openMacSettings(
  kind: keyof typeof MAC_SETTINGS_URLS,
  platform: NodeJS.Platform,
  open: (url: string) => Promise<void>,
): Promise<boolean> {
  if (platform !== 'darwin') return false;
  await open(MAC_SETTINGS_URLS[kind]);
  return true;
}
