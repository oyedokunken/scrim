import { execFile } from 'node:child_process';
import { BrowserWindow, ShareMenu, screen } from 'electron';
import { WINDOWS_SHARE_SCRIPT } from './windows-share-script';

export type ShareFile = (path: string) => Promise<void>;

interface Point {
  x: number;
  y: number;
}

export interface ShareDeps {
  platform: NodeJS.Platform;
  /** Where the share sheet should appear: the middle of the focused window, in screen pixels. */
  anchor: () => Point;
  /** Runs PowerShell with the script text and the environment, resolves when it exits. */
  runPowerShell: (script: string, env: Record<string, string>) => Promise<void>;
  /** Opens the macOS share menu for one file. */
  showMenu: (path: string) => void;
}

/**
 * The share sheet of this system, or null where there is none Scrim can open. Windows gets the
 * system share sheet, macOS gets its share menu. Linux desktops have no common share menu, so
 * the Share button is hidden there and the file can still be shown in its folder.
 */
export function createShare(deps: ShareDeps): ShareFile | null {
  if (deps.platform === 'win32') {
    return async (path) => {
      const at = deps.anchor();
      await deps.runPowerShell(WINDOWS_SHARE_SCRIPT, {
        SCRIM_SHARE_PATH: path,
        SCRIM_SHARE_X: String(Math.round(at.x)),
        SCRIM_SHARE_Y: String(Math.round(at.y)),
      });
    };
  }
  if (deps.platform === 'darwin') {
    return (path) => {
      deps.showMenu(path);
      return Promise.resolve();
    };
  }
  return null;
}

function runPowerShell(script: string, env: Record<string, string>): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ],
      { env: { ...process.env, ...env }, windowsHide: true },
      (error, _stdout, stderr) => {
        if (error === null) resolve();
        else reject(new Error(stderr.trim().split('\n')[0] ?? 'sharing failed'));
      },
    );
  });
}

/** The share sheet on the real machine. */
export function createRealShare(): ShareFile | null {
  return createShare({
    platform: process.platform,
    anchor: () => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window === undefined) {
        const area = screen.getPrimaryDisplay().workArea;
        return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
      }
      const bounds = window.getBounds();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 3 };
    },
    runPowerShell,
    showMenu: (path) => {
      new ShareMenu({ filePaths: [path] }).popup();
    },
  });
}
