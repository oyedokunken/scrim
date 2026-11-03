import { z } from 'zod';

/**
 * What the page needs to know about the system it runs on, so it can word things correctly and
 * hide what the system cannot do. The main process builds it from its platform module. It holds
 * no path, no name and nothing about the person.
 */
export const platformInfoSchema = z
  .object({
    os: z.enum(['windows', 'macos', 'linux']),
    /** Linux only: the kind of login session. Null elsewhere. */
    session: z.enum(['x11', 'wayland', 'unknown']).nullable(),
    /** The name of the app that browses files, for button and help text. */
    fileManager: z.enum(['Explorer', 'Finder', 'Files']),
    /** Whether the system has a share sheet Scrim can open. */
    shareSheet: z.boolean(),
    /** Whether cursor effects and auto zoom can work. */
    cursorEffects: z.boolean(),
    /** Plain words for the person when cursor effects are off, otherwise null. */
    cursorEffectsNote: z.string().max(400).nullable(),
    /** Plain words about global shortcuts when they may not work, otherwise null. */
    shortcutsNote: z.string().max(400).nullable(),
  })
  .strict();
export type PlatformInfo = z.infer<typeof platformInfoSchema>;

export const platformContract = {
  'platform:info': { input: z.void(), output: platformInfoSchema },
} as const;

/** The note shown on the Record, Zoom and Cursor pages on a Wayland session. */
export const WAYLAND_CURSOR_NOTE =
  'On Wayland, Linux does not let apps follow the mouse, so auto zoom and cursor effects are off. Log in with an X11 session to use them.';

/** The note about shortcuts on a Wayland session. */
export const WAYLAND_SHORTCUTS_NOTE =
  'On Wayland the desktop decides which apps may use global shortcuts. If a shortcut does not work here, start and stop from the Scrim icon in the system tray.';

/** What the page assumes until the main process answers: today's Windows behavior. */
export const DEFAULT_PLATFORM_INFO: PlatformInfo = {
  os: 'windows',
  session: null,
  fileManager: 'Explorer',
  shareSheet: true,
  cursorEffects: true,
  cursorEffectsNote: null,
  shortcutsNote: null,
};

/** A default folder as the person reads it: `Videos\Scrim` on Windows, `Videos/Scrim` elsewhere. */
export function defaultFolderLabel(folder: 'Videos' | 'Pictures', info: PlatformInfo): string {
  const separator = info.os === 'windows' ? '\\' : '/';
  return `${folder}${separator}Scrim`;
}

/** A path as the person reads it: real forward slashes on Linux and macOS, backslashes on Windows. */
export function displayPath(path: string, info: PlatformInfo): string {
  return info.os === 'windows' ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');
}
