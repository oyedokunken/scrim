/** One look at where the recorded window is, in device independent pixels on the desktop. */
export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundsStartResult = { status: 'started' } | { status: 'unavailable'; detail?: string };

/**
 * Follows a window's position and size while it is recorded, so mouse positions can be placed
 * relative to the window even when it moves. A source calls `onRect` when it starts and again
 * whenever the window changes.
 */
export interface WindowBoundsSource {
  start(onRect: (rect: WindowRect) => void): Promise<BoundsStartResult>;
  stop(): void;
}

/**
 * A source for a system where the window's position cannot be read. Electron has no call for the
 * bounds of another application's window, and reading them needs a native module that has not
 * been added yet. The recording carries on, and the session says the position was not followed.
 */
export function createUnavailableBoundsSource(detail: string): WindowBoundsSource {
  return {
    start: () => Promise.resolve({ status: 'unavailable', detail }),
    stop: () => undefined,
  };
}
