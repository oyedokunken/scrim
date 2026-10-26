import type { RawInputEvent } from '@scrim/core';

/** Why the mouse could not be logged. Matches the reasons the session file can hold. */
export type InputUnavailableReason = 'wayland' | 'permission' | 'error';

export type InputStartResult =
  | { status: 'started' }
  | { status: 'unavailable'; reason: InputUnavailableReason; detail?: string };

/**
 * A source of mouse events. There is no keyboard method and no key event type, by design: Scrim
 * never learns what is typed. The events carry no time. The recorder stamps each one when it
 * arrives, on the main clock.
 */
export interface InputSource {
  start(onEvent: (event: UnstampedEvent) => void): Promise<InputStartResult>;
  stop(): void;
}

/** A mouse event before it has a time on the main clock. */
export type UnstampedEvent =
  | { type: 'move'; x: number; y: number }
  | { type: 'down' | 'up'; x: number; y: number; button: 'left' | 'right' | 'middle' }
  | { type: 'wheel'; x: number; y: number; dx: number; dy: number };

export type StampedEvent = RawInputEvent;

/** What the hook passes to a listener. Fields a given event does not have are left out. */
export interface HookPayload {
  x: number;
  y: number;
  button?: unknown;
  direction?: unknown;
  rotation?: unknown;
}

/** The parts of uiohook-napi this code touches, so the real module can be swapped for a fake. */
export interface HookModule {
  uIOhook: {
    on(event: string, listener: (payload: HookPayload) => void): unknown;
    removeAllListeners(event?: string): unknown;
    start(): void;
    stop(): void;
  };
}

export interface HookSourceDeps {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  /** Loads uiohook-napi. Rejects when the native module is missing or will not load. */
  load: () => Promise<unknown>;
  /** macOS only: whether the app has the Accessibility permission the hook needs. */
  isAccessibilityTrusted: () => boolean;
  /** Converts a hook coordinate to device independent pixels on the desktop. */
  toDip: (point: { x: number; y: number }) => { x: number; y: number };
}

/** The hook reports buttons as 1 left, 2 right, 3 middle. Anything else is not logged. */
export function buttonName(button: unknown): 'left' | 'right' | 'middle' | undefined {
  switch (button) {
    case 1:
      return 'left';
    case 2:
      return 'right';
    case 3:
      return 'middle';
    default:
      return undefined;
  }
}

function isHookModule(value: unknown): value is HookModule {
  if (typeof value !== 'object' || value === null || !('uIOhook' in value)) return false;
  const hook: unknown = value.uIOhook;
  return (
    typeof hook === 'object' &&
    hook !== null &&
    'on' in hook &&
    typeof hook.on === 'function' &&
    'start' in hook &&
    typeof hook.start === 'function' &&
    'stop' in hook &&
    typeof hook.stop === 'function'
  );
}

/**
 * The mouse hook, loaded only when a recording starts and stopped when it ends. It listens for
 * moves, presses, releases and the wheel, and nothing else: no `keydown` or `keyup` listener is
 * ever registered. On Wayland, and on a Mac without the Accessibility permission, it reports the
 * input as unavailable instead of starting, so the recording carries on without a cursor log.
 */
export function createHookSource(deps: HookSourceDeps): InputSource {
  let hook: HookModule['uIOhook'] | undefined;

  return {
    async start(onEvent) {
      if (deps.platform === 'linux' && deps.env['XDG_SESSION_TYPE'] === 'wayland') {
        return { status: 'unavailable', reason: 'wayland' };
      }
      if (deps.platform === 'darwin' && !deps.isAccessibilityTrusted()) {
        return { status: 'unavailable', reason: 'permission' };
      }

      let loaded: unknown;
      try {
        loaded = await deps.load();
      } catch (error) {
        return {
          status: 'unavailable',
          reason: 'error',
          detail: error instanceof Error ? error.message : 'The mouse hook did not load.',
        };
      }
      if (!isHookModule(loaded)) {
        return { status: 'unavailable', reason: 'error', detail: 'The mouse hook has no API.' };
      }

      const emit = (event: UnstampedEvent): void => {
        const at = deps.toDip({ x: event.x, y: event.y });
        onEvent({ ...event, x: at.x, y: at.y });
      };
      const mouse = (type: 'down' | 'up') => (payload: HookPayload) => {
        const button = buttonName(payload.button);
        if (button !== undefined) emit({ type, x: payload.x, y: payload.y, button });
      };

      try {
        const target = loaded.uIOhook;
        target.on('mousemove', (payload) => {
          emit({ type: 'move', x: payload.x, y: payload.y });
        });
        target.on('mousedown', mouse('down'));
        target.on('mouseup', mouse('up'));
        target.on('wheel', (payload) => {
          const rotation = typeof payload.rotation === 'number' ? payload.rotation : 0;
          // Direction 3 is vertical and 4 is horizontal. Positive rotation is down or right.
          const horizontal = payload.direction === 4;
          emit({
            type: 'wheel',
            x: payload.x,
            y: payload.y,
            dx: horizontal ? rotation : 0,
            dy: horizontal ? 0 : rotation,
          });
        });
        target.start();
        hook = target;
        return { status: 'started' };
      } catch (error) {
        try {
          loaded.uIOhook.removeAllListeners();
        } catch {
          // Nothing more can be done for a hook that will not start.
        }
        return {
          status: 'unavailable',
          reason: 'error',
          detail: error instanceof Error ? error.message : 'The mouse hook did not start.',
        };
      }
    },
    stop() {
      if (hook === undefined) return;
      const target = hook;
      hook = undefined;
      try {
        target.removeAllListeners();
        target.stop();
      } catch {
        // Stopping a hook that is already gone is not an error worth stopping a recording for.
      }
    },
  };
}
