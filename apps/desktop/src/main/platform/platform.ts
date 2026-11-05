import { join } from 'node:path';
import {
  WAYLAND_CURSOR_NOTE,
  WAYLAND_SHORTCUTS_NOTE,
  type PlatformInfo,
} from '../../shared/platform-info';
import { projectsRoot as projectsRootFor } from '../recording/projects-folder';
import { linuxSessionOf, platformSwitches, type LinuxSession } from './platform-support';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Everything that differs from one system to another, in one place. The rest of the main process
 * asks this object instead of reading `process.platform`, so each system's behavior is one adapter
 * and every adapter can be tested with fakes on any machine.
 *
 * Windows is the reference: its adapter is exactly what the app did before this module existed.
 * Linux has its own adapter. macOS has no adapter of its own yet: it gets the generic one, which
 * keeps what the existing macOS files already do. To add a real macOS adapter, write a `macos`
 * branch in `createPlatform` and nothing else has to change.
 */
export interface Platform {
  readonly os: 'windows' | 'macos' | 'linux';
  /** Linux only. Never guessed: an unclear session is `unknown`. */
  readonly session: LinuxSession | null;
  readonly fileManager: 'Explorer' | 'Finder' | 'Files';
  readonly capture: {
    /**
     * `enumerate`: the app lists screens and windows and picks one itself (desktopCapturer and
     * setDisplayMediaRequestHandler). `portal`: the system screen sharing portal (PipeWire) shows
     * its own picker and the app gets the one source the person chose.
     */
    readonly mode: 'enumerate' | 'portal';
    /**
     * `overlay`: a transparent window over every display. `still-frame`: the app cannot cover
     * other apps, so its own window shows a still picture of the picked source to draw on.
     */
    readonly areaChooser: 'overlay' | 'still-frame';
    /** Milliseconds to wait after the chooser and countdown close, before the first frame. */
    readonly settleMs: number;
  };
  readonly mouseHook: { readonly available: boolean; readonly note: string | null };
  readonly globalShortcuts: { readonly mayFail: boolean; readonly note: string | null };
  /**
   * Whether `setContentProtection` really leaves a window out of a screen capture. Where it does
   * not (Linux), the live pill, bubble and overlays must keep out of the picture another way.
   */
  readonly hidesWindowsFromCapture: boolean;
  /** The tray needs a status notifier host (AppIndicator on GNOME), so it may be missing. */
  readonly trayNeedsIndicatorHost: boolean;
  /** The system has a share sheet Scrim can open. */
  readonly shareSheet: boolean;
  /** The taskbar button can carry a recording mark (an overlay icon). */
  readonly taskbarRecordingMark: boolean;
  /** Chromium switches to set before the app is ready. */
  readonly startupSwitches: ReadonlyArray<readonly [name: string, value?: string]>;
  readonly folders: {
    /** The working folders of recordings. One rule per system. */
    projectsRoot(userData: string): string;
    recordings(videos: string): string;
    screenshots(pictures: string): string;
  };
  /** What the page may know. */
  info(): PlatformInfo;
}

export interface PlatformInput {
  platform: NodeJS.Platform;
  env: Env;
}

function osOf(platform: NodeJS.Platform): Platform['os'] {
  if (platform === 'win32') return 'windows';
  return platform === 'darwin' ? 'macos' : 'linux';
}

/** Builds the adapter for a system. Pure: it reads only its input, so tests pass fakes. */
export function createPlatform(input: PlatformInput): Platform {
  const { platform, env } = input;
  const os = osOf(platform);
  const linux = os === 'linux';
  const session = linux ? linuxSessionOf(env) : null;
  const wayland = session === 'wayland';

  // One rule for where working files live, shared with the rest of the main process.
  const projectsRoot = (userData: string): string => projectsRootFor({ platform, env, userData });

  const result: Platform = {
    os,
    session,
    fileManager: os === 'windows' ? 'Explorer' : os === 'macos' ? 'Finder' : 'Files',
    capture: {
      mode: wayland ? 'portal' : 'enumerate',
      areaChooser: wayland ? 'still-frame' : 'overlay',
      settleMs: linux ? 450 : 180,
    },
    mouseHook: {
      available: !wayland,
      note: wayland ? WAYLAND_CURSOR_NOTE : null,
    },
    globalShortcuts: {
      mayFail: wayland,
      note: wayland ? WAYLAND_SHORTCUTS_NOTE : null,
    },
    hidesWindowsFromCapture: !linux,
    trayNeedsIndicatorHost: linux,
    shareSheet: !linux,
    taskbarRecordingMark: os === 'windows',
    startupSwitches: platformSwitches({ platform, env }),
    folders: {
      projectsRoot,
      recordings: (videos) => join(videos, 'Scrim'),
      screenshots: (pictures) => join(pictures, 'Scrim'),
    },
    info() {
      return {
        os,
        session,
        fileManager: result.fileManager,
        shareSheet: result.shareSheet,
        cursorEffects: result.mouseHook.available,
        cursorEffectsNote: result.mouseHook.note,
        shortcutsNote: result.globalShortcuts.note,
      };
    },
  };
  return result;
}

let override: Platform | undefined;
let cached: Platform | undefined;

/** The adapter for this machine, built once from the real process. */
export function currentPlatform(): Platform {
  if (override !== undefined) return override;
  cached ??= createPlatform({ platform: process.platform, env: process.env });
  return cached;
}

/** For tests: use this adapter instead of the real one. Pass undefined to go back. */
export function setPlatformOverride(next: Platform | undefined): void {
  override = next;
}
