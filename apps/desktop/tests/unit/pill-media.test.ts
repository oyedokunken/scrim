import { describe, expect, it } from 'vitest';
import {
  actionForPress,
  mediaButtonView,
  mediaErrorNote,
  NO_MEDIA,
  UNAVAILABLE_TITLE,
} from '../../src/recorder/pill/media-view';
import { mediaStateSchema, pillActionSchema } from '../../src/recorder/pill/protocol';
import { bubbleEventSchema } from '../../src/recorder/bubble/protocol';
import { recorderEventSchema } from '../../src/recorder/protocol-schemas';

describe('the pill media actions', () => {
  it('accepts the two named-state actions', () => {
    expect(pillActionSchema.safeParse({ type: 'set-mic-muted', muted: true }).success).toBe(true);
    expect(pillActionSchema.safeParse({ type: 'set-camera-enabled', enabled: false }).success).toBe(
      true,
    );
  });

  it.each([
    ['a flip with no state', { type: 'set-mic-muted' }],
    ['a string for the state', { type: 'set-camera-enabled', enabled: 'no' }],
    ['a stray field', { type: 'set-mic-muted', muted: true, device: 'x' }],
    ['an unknown action', { type: 'set-screen-enabled', enabled: true }],
  ])('rejects %s', (_name, action) => {
    expect(pillActionSchema.safeParse(action).success).toBe(false);
  });

  it('validates the broadcast state and rejects an unknown error', () => {
    expect(mediaStateSchema.safeParse(NO_MEDIA).success).toBe(true);
    expect(
      mediaStateSchema.safeParse({
        ...NO_MEDIA,
        camera: { available: true, active: false, error: 'device-busy' },
      }).success,
    ).toBe(true);
    expect(
      mediaStateSchema.safeParse({
        ...NO_MEDIA,
        camera: { available: true, active: false, error: 'on fire' },
      }).success,
    ).toBe(false);
  });

  it('knows the recorder reply and the bubble report', () => {
    expect(
      recorderEventSchema.safeParse({
        type: 'enabled',
        kind: 'mic',
        enabled: false,
        ok: true,
        rendererNow: 5,
      }).success,
    ).toBe(true);
    expect(
      recorderEventSchema.safeParse({
        type: 'enabled',
        kind: 'screen',
        enabled: false,
        ok: true,
        rendererNow: 5,
      }).success,
    ).toBe(false);
    expect(
      bubbleEventSchema.safeParse({ type: 'camera-failed', reason: 'device-busy' }).success,
    ).toBe(true);
    expect(bubbleEventSchema.safeParse({ type: 'camera-failed', reason: 'bad' }).success).toBe(
      false,
    );
  });
});

describe('what the buttons show', () => {
  it('shows the microphone as on, with a name that says what a press does', () => {
    expect(mediaButtonView('mic', { available: true, active: true })).toMatchObject({
      title: 'Mute microphone',
      label: 'Mute microphone',
      off: false,
      pressed: false,
      disabled: false,
      errored: false,
    });
  });

  it('shows a muted microphone with the slashed icon and the pressed state', () => {
    expect(mediaButtonView('mic', { available: true, active: false })).toMatchObject({
      title: 'Unmute microphone',
      off: true,
      pressed: true,
      disabled: false,
    });
  });

  it('words the camera button both ways', () => {
    expect(mediaButtonView('camera', { available: true, active: true }).title).toBe(
      'Turn camera off',
    );
    expect(mediaButtonView('camera', { available: true, active: false }).title).toBe(
      'Turn camera on',
    );
  });

  it('disables a device that was off before recording and says so', () => {
    for (const kind of ['mic', 'camera'] as const) {
      const view = mediaButtonView(kind, { available: false, active: false });
      expect(view.title).toBe('Turned off before you started recording');
      expect(view.title).toBe(UNAVAILABLE_TITLE);
      expect(view).toMatchObject({ disabled: true, off: true });
      expect(view.label.toLowerCase()).toContain('turned off before you started recording');
    }
  });

  it('disables an unplugged device and gives a short message', () => {
    const view = mediaButtonView('mic', {
      available: true,
      active: false,
      error: 'device-removed',
    });
    expect(view).toMatchObject({ disabled: true, errored: true, note: 'Microphone unplugged' });
  });

  it('keeps a camera that is busy or blocked usable, with the message', () => {
    const busy = mediaButtonView('camera', {
      available: true,
      active: false,
      error: 'device-busy',
    });
    expect(busy).toMatchObject({ disabled: false, errored: true, note: 'Camera is busy' });
    expect(busy.off).toBe(true);
    expect(mediaErrorNote('camera', 'permission-denied')).toBe('Camera access is off');
    expect(mediaErrorNote('mic', 'unknown')).toBe('Microphone did not change');
  });

  it('keeps every message short enough for the pill', () => {
    for (const kind of ['mic', 'camera'] as const) {
      for (const error of [
        'device-removed',
        'device-busy',
        'permission-denied',
        'unknown',
      ] as const) {
        expect(mediaErrorNote(kind, error).length).toBeLessThanOrEqual(28);
      }
    }
  });
});

describe('what a press asks for', () => {
  it('names the state wanted, never a flip', () => {
    expect(actionForPress('mic', { available: true, active: true })).toEqual({
      type: 'set-mic-muted',
      muted: true,
    });
    expect(actionForPress('mic', { available: true, active: false })).toEqual({
      type: 'set-mic-muted',
      muted: false,
    });
    expect(actionForPress('camera', { available: true, active: true })).toEqual({
      type: 'set-camera-enabled',
      enabled: false,
    });
    expect(actionForPress('camera', { available: true, active: false })).toEqual({
      type: 'set-camera-enabled',
      enabled: true,
    });
  });

  it('asks for nothing when the device is not available or was unplugged', () => {
    expect(actionForPress('mic', { available: false, active: false })).toBeUndefined();
    expect(
      actionForPress('camera', { available: true, active: false, error: 'device-removed' }),
    ).toBeUndefined();
  });
});
