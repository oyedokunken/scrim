export type LinuxSession = 'x11' | 'wayland' | 'unknown';

export interface PlatformSupport {
  /** Cursor halo, click ripples and auto zoom need the global mouse hook. */
  cursorEffects: boolean;
  /** Plain words for the user when cursor effects are off, otherwise undefined. */
  cursorEffectsNote?: string | undefined;
  /** Set on Linux only. */
  linuxSession?: LinuxSession | undefined;
  /** Screen capture goes through a system prompt (macOS Screen Recording, Linux portal). */
  captureNeedsSystemPrompt: boolean;
  /** The text for the modifier key in shortcut labels. */
  modifierLabel: 'Ctrl' | 'Cmd';
}

/** Reads the Linux session type from the environment. Unknown stays unknown, never guessed. */
export function linuxSessionOf(env: Readonly<Record<string, string | undefined>>): LinuxSession {
  const type = (env['XDG_SESSION_TYPE'] ?? '').toLowerCase();
  if (type === 'wayland') return 'wayland';
  if (type === 'x11') return 'x11';
  // Some sessions only set one of these.
  if ((env['WAYLAND_DISPLAY'] ?? '') !== '' && type === '') return 'wayland';
  if ((env['DISPLAY'] ?? '') !== '' && type === '') return 'x11';
  return 'unknown';
}

/**
 * What this system can do, decided from the platform and the environment alone so it can be
 * tested everywhere. The mouse hook itself refuses on Wayland (input-source.ts), and this says
 * the same thing earlier so the home screen can explain it before a recording starts.
 */
export function describePlatformSupport(input: {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}): PlatformSupport {
  const { platform, env } = input;
  if (platform === 'linux') {
    const session = linuxSessionOf(env);
    const wayland = session === 'wayland';
    return {
      cursorEffects: !wayland,
      cursorEffectsNote: wayland
        ? 'Cursor effects and auto zoom are off on Wayland, because Wayland does not let apps see the mouse. Log out and choose an X11 session at the login screen to use them. Screen recording still works.'
        : undefined,
      linuxSession: session,
      captureNeedsSystemPrompt: wayland,
      modifierLabel: 'Ctrl',
    };
  }
  return {
    cursorEffects: true,
    captureNeedsSystemPrompt: platform === 'darwin',
    modifierLabel: platform === 'darwin' ? 'Cmd' : 'Ctrl',
  };
}

/**
 * Chromium switches to set before the app is ready, as name and optional value pairs. On a Wayland
 * session they let Electron run natively and capture the screen through the PipeWire portal. On
 * X11, and on every other system, there are none.
 */
export function platformSwitches(input: {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}): ReadonlyArray<readonly [name: string, value?: string]> {
  if (input.platform !== 'linux' || linuxSessionOf(input.env) !== 'wayland') return [];
  return [
    ['ozone-platform-hint', 'auto'],
    ['enable-features', 'WebRTCPipeWireCapturer'],
  ];
}
