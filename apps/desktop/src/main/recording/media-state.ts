import { NO_MEDIA } from '../../recorder/pill/media-view';
import type { MediaDeviceState, MediaError, MediaState } from '../../recorder/pill/protocol';
import type { RecordingSnapshot } from './types';

export type DeviceKind = 'mic' | 'camera';

export type ApplyResult = { ok: true } | { ok: false; reason: MediaError };

export interface MediaStateDeps {
  /** Switches the live track on or off. The real one asks the recording service. */
  apply: (kind: DeviceKind, enabled: boolean) => Promise<ApplyResult>;
  /** Called after every change, so the pill and the bubble can show the new state. */
  onChange: (state: MediaState) => void;
  /** Milliseconds on any steady clock. */
  now: () => number;
}

/** Presses closer together than this are one press. A tap that bounces cannot flood the log. */
export const TOGGLE_DEBOUNCE_MS = 150;

/** Turns the reason the recorder page gave into one the pill can word. */
export function mediaErrorOf(reason: string | undefined): MediaError {
  switch (reason) {
    case 'permission-denied':
      return 'permission-denied';
    case 'device-missing':
    case 'device-removed':
      return 'device-removed';
    case 'device-busy':
      return 'device-busy';
    default:
      return 'unknown';
  }
}

function device(available: boolean): MediaDeviceState {
  return { available, active: available };
}

/**
 * The microphone and camera buttons as a small state machine that lives in main. A device that
 * was off before recording stays unavailable, and nothing can turn it on mid recording. For the
 * others a request names the state wanted, so the same request twice changes nothing. One change
 * per device runs at a time, and a press right after another is dropped. A failed change leaves
 * the device as it was and records why, and a device that was unplugged cannot be toggled again.
 */
export function createMediaState(deps: MediaStateDeps) {
  let state: MediaState = NO_MEDIA;
  let began = false;
  const isLive = (): boolean => began;
  const inFlight = new Set<DeviceKind>();
  const lastChange: Record<DeviceKind, number> = { mic: -Infinity, camera: -Infinity };

  const set = (next: MediaState): void => {
    state = next;
    deps.onChange(state);
  };

  const patch = (kind: DeviceKind, next: MediaDeviceState): void => {
    set({ ...state, [kind]: next });
  };

  async function request(kind: DeviceKind, active: boolean): Promise<void> {
    const current = state[kind];
    if (!current.available || current.error === 'device-removed') return;
    if (current.active === active && current.error === undefined) return;
    if (inFlight.has(kind)) return;
    if (deps.now() - lastChange[kind] < TOGGLE_DEBOUNCE_MS) return;
    inFlight.add(kind);
    lastChange[kind] = deps.now();
    try {
      const result = await deps.apply(kind, active);
      // The recording may have ended while the recorder was answering.
      if (!isLive()) return;
      if (result.ok) patch(kind, { available: true, active });
      else patch(kind, { available: true, active: current.active, error: result.reason });
    } catch {
      if (isLive()) patch(kind, { available: true, active: current.active, error: 'unknown' });
    } finally {
      inFlight.delete(kind);
    }
  }

  return {
    get: (): MediaState => state,
    /** A recording went live. The devices it was started with decide which buttons work. */
    begin(devices: { mic: boolean; camera: boolean }): void {
      began = true;
      inFlight.clear();
      lastChange.mic = -Infinity;
      lastChange.camera = -Infinity;
      set({ mic: device(devices.mic), camera: device(devices.camera) });
    },
    /** The recording is over. */
    end(): void {
      if (!began && state === NO_MEDIA) return;
      began = false;
      inFlight.clear();
      set(NO_MEDIA);
    },
    isLive: (): boolean => began,
    /** Mute is `true`. Unmute is `false`. */
    setMicMuted: (muted: boolean): Promise<void> => request('mic', !muted),
    setCameraEnabled: (enabled: boolean): Promise<void> => request('camera', enabled),
    /** A device went away mid recording. Its button shows the error and stops toggling. */
    deviceLost(kind: DeviceKind): void {
      if (!began || !state[kind].available || state[kind].error === 'device-removed') return;
      patch(kind, { available: true, active: false, error: 'device-removed' });
    },
    /**
     * Something outside the recorder found the device unusable, for example the camera could not
     * be reopened for the bubble. The device is switched back off and the reason is shown.
     */
    async fail(kind: DeviceKind, reason: MediaError): Promise<void> {
      if (!began || !state[kind].available) return;
      if (state[kind].active) await deps.apply(kind, false).catch(() => undefined);
      if (isLive()) patch(kind, { available: true, active: false, error: reason });
    },
  };
}

/** The tracks a recording really opened and has not lost, from the engine's own report. */
export function mediaFromSnapshot(
  snapshot: Pick<RecordingSnapshot, 'tracks'>,
  requested: { mic: boolean; camera: boolean },
): { devices: { mic: boolean; camera: boolean }; lost: DeviceKind[] } {
  const has = (kind: DeviceKind): boolean => snapshot.tracks.some((track) => track.kind === kind);
  const lost = (['mic', 'camera'] as const).filter((kind) =>
    snapshot.tracks.some((track) => track.kind === kind && track.ended),
  );
  return {
    devices: { mic: requested.mic && has('mic'), camera: requested.camera && has('camera') },
    lost,
  };
}
