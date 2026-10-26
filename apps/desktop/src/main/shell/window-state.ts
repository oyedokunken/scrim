import { z } from 'zod';

export const savedWindowStateSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maximized: z.boolean(),
  /** The display the window was on, so it is restored only when that display is still there. */
  displayId: z.number().int(),
});
export type SavedWindowState = z.infer<typeof savedWindowStateSchema>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DisplayInfo {
  id: number;
  workArea: Rect;
}
export interface Size {
  width: number;
  height: number;
}
export interface ResolvedBounds {
  /** Undefined means let the system center the window. */
  x: number | undefined;
  y: number | undefined;
  width: number;
  height: number;
  maximized: boolean;
}

const MIN_VISIBLE = 120;

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * The bounds to open the window with. The saved state is used only when it parses, the display
 * it was on still exists and enough of the window would be visible there. Otherwise the window
 * opens at its default size, centered. The size is never smaller than the minimum or larger
 * than the display.
 */
export function resolveWindowBounds(
  saved: unknown,
  displays: readonly DisplayInfo[],
  defaults: Size,
  minimum: Size,
): ResolvedBounds {
  const fallback: ResolvedBounds = {
    x: undefined,
    y: undefined,
    width: defaults.width,
    height: defaults.height,
    maximized: false,
  };
  const parsed = savedWindowStateSchema.safeParse(saved);
  if (!parsed.success) return fallback;
  const state = parsed.data;

  const display = displays.find((candidate) => candidate.id === state.displayId);
  if (!display) return fallback;

  const area = display.workArea;
  const width = Math.min(Math.max(state.width, minimum.width), area.width);
  const height = Math.min(Math.max(state.height, minimum.height), area.height);
  const visible = overlap({ x: state.x, y: state.y, width, height }, area);
  if (visible.width < MIN_VISIBLE || visible.height < MIN_VISIBLE) return fallback;

  // Pull the window fully back onto the display when it hangs over an edge.
  const x = Math.min(Math.max(state.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(state.y, area.y), area.y + area.height - height);
  return { x, y, width, height, maximized: state.maximized };
}

/** The file system the store needs, so a test can fail it. */
export interface WindowStateFs {
  readText(path: string): Promise<string | undefined>;
  writeJsonAtomic(path: string, value: unknown): Promise<void>;
  /** For the moment the window closes: the app may exit before an async write finishes. */
  writeJsonSync(path: string, value: unknown): void;
}

/** Reads and writes the saved window state. A missing or broken file means no saved state. */
export function createWindowStateStore(path: string, fs: WindowStateFs) {
  return {
    async load(): Promise<unknown> {
      try {
        const text = await fs.readText(path);
        return text === undefined ? undefined : (JSON.parse(text) as unknown);
      } catch {
        return undefined;
      }
    },
    /** Writes now, before returning. Used when the window is closing and the app may quit. */
    saveSync(state: SavedWindowState): void {
      try {
        fs.writeJsonSync(path, savedWindowStateSchema.parse(state));
      } catch {
        // Same rule as save: never interrupt the person over a window position.
      }
    },
    async save(state: SavedWindowState): Promise<void> {
      try {
        await fs.writeJsonAtomic(path, savedWindowStateSchema.parse(state));
      } catch {
        // Losing a window position is never worth interrupting the person.
      }
    },
  };
}
