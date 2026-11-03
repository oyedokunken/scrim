import { describe, expect, it } from 'vitest';
import {
  createMediaState,
  mediaErrorOf,
  mediaFromSnapshot,
  TOGGLE_DEBOUNCE_MS,
  type ApplyResult,
  type DeviceKind,
} from '../../src/main/recording/media-state';
import type { MediaState } from '../../src/recorder/pill/protocol';

function setup() {
  const clock = { now: 1000 };
  const applied: string[] = [];
  const states: MediaState[] = [];
  const control: { result: ApplyResult; gate: Promise<void> | undefined } = {
    result: { ok: true },
    gate: undefined,
  };
  const state = createMediaState({
    now: () => clock.now,
    apply: async (kind: DeviceKind, enabled: boolean) => {
      applied.push(`${kind} ${String(enabled)}`);
      if (control.gate !== undefined) await control.gate;
      return control.result;
    },
    onChange: (next) => states.push(next),
  });
  const later = (ms = TOGGLE_DEBOUNCE_MS + 1): void => {
    clock.now += ms;
  };
  return { state, applied, states, control, later, clock };
}

describe('the media state machine', () => {
  it('starts with both buttons unavailable, and begins from the devices the recording has', () => {
    const t = setup();
    expect(t.state.get().mic.available).toBe(false);
    t.state.begin({ mic: true, camera: false });
    expect(t.state.get()).toEqual({
      mic: { available: true, active: true },
      camera: { available: false, active: false },
    });
    expect(t.state.isLive()).toBe(true);
  });

  it('mutes and unmutes, and each change is broadcast', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setMicMuted(true);
    expect(t.state.get().mic).toEqual({ available: true, active: false });
    t.later();
    await t.state.setMicMuted(false);
    expect(t.state.get().mic).toEqual({ available: true, active: true });
    expect(t.applied).toEqual(['mic false', 'mic true']);
    expect(t.states.at(-1)?.mic.active).toBe(true);
  });

  it('turns the camera off and on again', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setCameraEnabled(false);
    t.later();
    expect(t.state.get().camera.active).toBe(false);
    await t.state.setCameraEnabled(true);
    expect(t.state.get().camera.active).toBe(true);
    expect(t.applied).toEqual(['camera false', 'camera true']);
  });

  it('is idempotent: asking for the state a device already has does nothing', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setMicMuted(false);
    await t.state.setCameraEnabled(true);
    expect(t.applied).toEqual([]);
    await t.state.setMicMuted(true);
    t.later();
    await t.state.setMicMuted(true);
    expect(t.applied).toEqual(['mic false']);
  });

  it('drops a press right after another, then accepts one after the debounce', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setMicMuted(true);
    t.clock.now += TOGGLE_DEBOUNCE_MS - 10;
    await t.state.setMicMuted(false);
    expect(t.state.get().mic.active).toBe(false);
    t.clock.now += 20;
    await t.state.setMicMuted(false);
    expect(t.state.get().mic.active).toBe(true);
    expect(t.applied).toHaveLength(2);
  });

  it('runs one change per device at a time, and the two devices are independent', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    let release: () => void = () => undefined;
    t.control.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = t.state.setMicMuted(true);
    const repeat = t.state.setMicMuted(true);
    const other = t.state.setCameraEnabled(false);
    release();
    await Promise.all([first, repeat, other]);
    expect(t.applied).toEqual(['mic false', 'camera false']);
  });

  it('cannot turn on a device that was off before recording', async () => {
    const t = setup();
    t.state.begin({ mic: false, camera: false });
    await t.state.setMicMuted(false);
    await t.state.setCameraEnabled(true);
    expect(t.applied).toEqual([]);
    expect(t.state.get().camera).toEqual({ available: false, active: false });
  });

  it('keeps the old state and shows the reason when the recorder refuses', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setCameraEnabled(false);
    t.later();
    t.control.result = { ok: false, reason: 'device-busy' };
    await t.state.setCameraEnabled(true);
    expect(t.state.get().camera).toEqual({ available: true, active: false, error: 'device-busy' });
    // The error is not a lock: another press tries again and clears it on success.
    t.later();
    t.control.result = { ok: true };
    await t.state.setCameraEnabled(true);
    expect(t.state.get().camera).toEqual({ available: true, active: true });
  });

  it('treats a throw like a refusal', async () => {
    const clock = { now: 0 };
    const state = createMediaState({
      now: () => clock.now,
      apply: () => Promise.reject(new Error('gone')),
      onChange: () => undefined,
    });
    state.begin({ mic: true, camera: false });
    await state.setMicMuted(true);
    expect(state.get().mic).toEqual({ available: true, active: true, error: 'unknown' });
  });

  it('shows an unplugged device as an error and never toggles it again', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    t.state.deviceLost('mic');
    expect(t.state.get().mic).toEqual({ available: true, active: false, error: 'device-removed' });
    t.later();
    await t.state.setMicMuted(false);
    expect(t.applied).toEqual([]);
    expect(t.state.get().camera.error).toBeUndefined();
  });

  it('puts the camera back off and says why when it cannot be shown again', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.fail('camera', 'device-busy');
    expect(t.applied).toEqual(['camera false']);
    expect(t.state.get().camera).toEqual({ available: true, active: false, error: 'device-busy' });
  });

  it('keeps a muted microphone muted across a pause and a resume', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    await t.state.setMicMuted(true);
    // The engine begins the media state once per recording, so a pause and a resume never reach
    // it. This is how main drives it: begin only when it is not live yet, on every state event.
    const begin = (): void => {
      if (!t.state.isLive()) t.state.begin({ mic: true, camera: true });
    };
    begin();
    t.later();
    begin();
    expect(t.state.get().mic).toEqual({ available: true, active: false });
  });

  it('ends cleanly, ignores a late answer, and starts afresh next time', async () => {
    const t = setup();
    t.state.begin({ mic: true, camera: true });
    let release: () => void = () => undefined;
    t.control.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = t.state.setMicMuted(true);
    t.state.end();
    release();
    await pending;
    expect(t.state.get().mic.available).toBe(false);
    t.control.gate = undefined;
    t.later();
    t.state.begin({ mic: true, camera: true });
    expect(t.state.get().mic).toEqual({ available: true, active: true });
  });
});

describe('mediaErrorOf', () => {
  it('words the recorder reasons for the pill', () => {
    expect(mediaErrorOf('permission-denied')).toBe('permission-denied');
    expect(mediaErrorOf('device-missing')).toBe('device-removed');
    expect(mediaErrorOf('device-busy')).toBe('device-busy');
    expect(mediaErrorOf('something else')).toBe('unknown');
    expect(mediaErrorOf(undefined)).toBe('unknown');
  });
});

describe('mediaFromSnapshot', () => {
  const track = (kind: 'screen' | 'mic' | 'camera', ended = false) => ({
    kind,
    bytesWritten: 0,
    ended,
  });

  it('needs both a request and an opened track, and reports lost devices', () => {
    const seen = mediaFromSnapshot(
      { tracks: [track('screen'), track('mic', true)] },
      { mic: true, camera: true },
    );
    expect(seen.devices).toEqual({ mic: true, camera: false });
    expect(seen.lost).toEqual(['mic']);
  });

  it('shows a device as off when it was not requested', () => {
    const seen = mediaFromSnapshot(
      { tracks: [track('screen'), track('mic'), track('camera')] },
      { mic: false, camera: true },
    );
    expect(seen.devices).toEqual({ mic: false, camera: true });
    expect(seen.lost).toEqual([]);
  });
});
