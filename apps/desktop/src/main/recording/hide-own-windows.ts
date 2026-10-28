/** The slice of a window this code uses. The real one is Electron's `BrowserWindow`. */
export interface HideableWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  hide(): void;
  showInactive(): void;
}

export interface HideDeps {
  /** Every window the app has, including the ones that are closing. */
  windows(): { window: HideableWindow; overlay: boolean }[];
  wait(ms: number): Promise<void>;
  now(): number;
  /** How long to wait for the windows to leave the screen before capturing anyway. */
  timeoutMs?: number;
  /** How often to look again. */
  pollMs?: number;
  /** Time after the last window is gone for the system to finish drawing the empty screen. */
  settleMs?: number;
  log(message: string): void;
}

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_POLL_MS = 100;
const DEFAULT_SETTLE_MS = 150;

const isGone = (window: HideableWindow): boolean =>
  window.isDestroyed() || !window.isVisible() || window.isMinimized();

/**
 * Takes every Scrim window off the screen and waits until none is left, so a screenshot never
 * contains the app's own dialogs, welcome page, pill or camera bubble. Windows that are already
 * minimized or closing count as gone. The returned function brings back the windows that were
 * hidden here, without taking focus. Overlays that are closing are waited for but never brought
 * back.
 */
export async function hideOwnWindows(deps: HideDeps): Promise<() => void> {
  const hidden: HideableWindow[] = [];
  const tracked = deps.windows();
  for (const { window, overlay } of tracked) {
    if (window.isDestroyed() || isGone(window) || overlay) continue;
    try {
      window.hide();
      hidden.push(window);
    } catch (error) {
      deps.log(`A window would not hide: ${String(error)}`);
    }
  }

  const timeout = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const poll = deps.pollMs ?? DEFAULT_POLL_MS;
  const startedAt = deps.now();
  while (tracked.some(({ window }) => !isGone(window))) {
    if (deps.now() - startedAt >= timeout) {
      deps.log('A Scrim window was still on screen when the screenshot was taken.');
      break;
    }
    await deps.wait(poll);
  }
  await deps.wait(deps.settleMs ?? DEFAULT_SETTLE_MS);

  return () => {
    for (const window of hidden) {
      if (window.isDestroyed()) continue;
      try {
        window.showInactive();
      } catch (error) {
        deps.log(`A window would not come back: ${String(error)}`);
      }
    }
  };
}
