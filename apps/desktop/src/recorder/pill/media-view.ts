import type { MediaDeviceState, MediaError, MediaState } from './protocol';

export type MediaKind = 'mic' | 'camera';

/**
 * Before a recording has devices, both buttons show as unavailable. Kept here, away from the zod
 * schemas in `protocol.ts`, so the pill page does not bundle zod for a constant.
 */
export const NO_MEDIA: MediaState = {
  mic: { available: false, active: false },
  camera: { available: false, active: false },
};

/** Everything one of the two buttons shows, worked out from the state alone. */
export interface MediaButtonView {
  /** Tooltip. */
  title: string;
  /** Accessible name. */
  label: string;
  /** True when the slashed icon shows: muted, camera off, or not available. */
  off: boolean;
  /** Mirrors the pressed state for assistive technology. */
  pressed: boolean;
  disabled: boolean;
  /** Set after a failed change that can be tried again. */
  errored: boolean;
  /** A short message to show for a few seconds, or undefined. */
  note: string | undefined;
}

const NAME: Record<MediaKind, string> = { mic: 'Microphone', camera: 'Camera' };

export const UNAVAILABLE_TITLE = 'Turned off before you started recording';

/** Plain words for each error, short enough for the pill. */
export function mediaErrorNote(kind: MediaKind, error: MediaError): string {
  const name = NAME[kind];
  switch (error) {
    case 'device-removed':
      return `${name} unplugged`;
    case 'device-busy':
      return `${name} is busy`;
    case 'permission-denied':
      return `${name} access is off`;
    case 'unknown':
      return `${name} did not change`;
  }
}

export function mediaButtonView(kind: MediaKind, device: MediaDeviceState): MediaButtonView {
  if (!device.available) {
    return {
      title: UNAVAILABLE_TITLE,
      label: `${NAME[kind]}: ${UNAVAILABLE_TITLE.toLowerCase()}`,
      off: true,
      pressed: true,
      disabled: true,
      errored: false,
      note: undefined,
    };
  }
  if (device.error === 'device-removed') {
    const note = mediaErrorNote(kind, 'device-removed');
    return {
      title: note,
      label: note,
      off: true,
      pressed: true,
      disabled: true,
      errored: true,
      note,
    };
  }
  const off = !device.active;
  const title =
    kind === 'mic'
      ? off
        ? 'Unmute microphone'
        : 'Mute microphone'
      : off
        ? 'Turn camera on'
        : 'Turn camera off';
  return {
    title,
    label: title,
    off,
    pressed: off,
    disabled: false,
    errored: device.error !== undefined,
    note: device.error === undefined ? undefined : mediaErrorNote(kind, device.error),
  };
}

/** What a press asks for, from what the button shows now. Always a named state, never a flip. */
export function actionForPress(
  kind: MediaKind,
  device: MediaDeviceState,
):
  | { type: 'set-mic-muted'; muted: boolean }
  | { type: 'set-camera-enabled'; enabled: boolean }
  | undefined {
  if (!device.available || device.error === 'device-removed') return undefined;
  return kind === 'mic'
    ? { type: 'set-mic-muted', muted: device.active }
    : { type: 'set-camera-enabled', enabled: !device.active };
}
