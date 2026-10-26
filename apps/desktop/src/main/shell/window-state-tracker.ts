import { app, screen, type BrowserWindow } from 'electron';
import { renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../recording/fs-adapter';
import {
  createWindowStateStore,
  resolveWindowBounds,
  type ResolvedBounds,
  type SavedWindowState,
  type Size,
} from './window-state';

const realFs = {
  async readText(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf8');
    } catch {
      return undefined;
    }
  },
  writeJsonAtomic,
  writeJsonSync(path: string, value: unknown): void {
    const temp = `${path}.tmp`;
    writeFileSync(
      temp,
      `${JSON.stringify(value, null, 2)}
`,
    );
    renameSync(temp, path);
  },
};

const SAVE_DELAY_MS = 500;

/** Remembers where the main window was, per display, and puts it back on the next launch. */
export function createWindowStateTracker(defaults: Size, minimum: Size) {
  const store = createWindowStateStore(join(app.getPath('userData'), 'window-state.json'), realFs);

  return {
    async initialBounds(): Promise<ResolvedBounds> {
      const displays = screen.getAllDisplays().map((display) => ({
        id: display.id,
        workArea: display.workArea,
      }));
      return resolveWindowBounds(await store.load(), displays, defaults, minimum);
    },

    track(window: BrowserWindow): void {
      let timer: NodeJS.Timeout | undefined;
      const snapshot = (): SavedWindowState | undefined => {
        if (window.isDestroyed() || window.isMinimized() || !window.isVisible()) return undefined;
        const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
        return {
          ...bounds,
          maximized: window.isMaximized(),
          displayId: screen.getDisplayMatching(window.getBounds()).id,
        };
      };
      const save = (): void => {
        const state = snapshot();
        if (state) void store.save(state);
      };
      const later = (): void => {
        clearTimeout(timer);
        timer = setTimeout(save, SAVE_DELAY_MS);
      };
      window.on('resize', later);
      window.on('move', later);
      window.on('maximize', later);
      window.on('unmaximize', later);
      window.on('close', () => {
        clearTimeout(timer);
        const state = snapshot();
        if (state) store.saveSync(state);
      });
    },
  };
}
