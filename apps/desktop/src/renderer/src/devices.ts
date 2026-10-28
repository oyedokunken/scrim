export interface RawDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface DeviceOption {
  deviceId: string;
  label: string;
  /** The device the system uses when none is chosen. Shown as a small tag. */
  isDefault: boolean;
}

const VIRTUAL_IDS = new Set(['default', 'communications']);
const ROLE_PREFIX = /^(default|communications)\s*-\s*/i;

/**
 * Chromium reads names from the system as they are, for example `Microphone Array (2- Realtek(R)
 * Audio)`. The `2- ` is the system's duplicate counter, and a camera may end in its `(046d:0825)`
 * ids. Neither means anything to a person, so both go, along with a Default or Communications prefix.
 */
export function cleanDeviceName(label: string): string {
  return label
    .replace(ROLE_PREFIX, '')
    .replace(/\(\d+\s*-\s+/g, '(')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .trim();
}

/**
 * One entry per real device. Windows lists the system default and the communications device again
 * under fixed ids, so those entries are dropped and the device they point at gets a Default tag
 * instead. Before the person allows access the labels are empty, and numbered names stand in.
 */
export function listDevices(all: readonly RawDevice[], fallback: string): DeviceOption[] {
  const defaultEntry = all.find((device) => device.deviceId === 'default');
  const real = all.filter((device) => device.deviceId !== '' && !VIRTUAL_IDS.has(device.deviceId));

  const defaultName = defaultEntry === undefined ? null : cleanDeviceName(defaultEntry.label);
  const defaultGroup =
    defaultEntry !== undefined && defaultEntry.groupId !== '' ? defaultEntry.groupId : null;

  const seen = new Set<string>();
  const options: DeviceOption[] = [];
  real.forEach((device, index) => {
    const label =
      device.label === '' ? `${fallback} ${String(index + 1)}` : cleanDeviceName(device.label);
    if (seen.has(label)) return;
    seen.add(label);
    const isDefault =
      defaultEntry !== undefined &&
      ((defaultGroup !== null && device.groupId === defaultGroup) || label === defaultName);
    options.push({ deviceId: device.deviceId, label, isDefault });
  });

  // One tag only, on the first match.
  let tagged = false;
  return options.map((option) => {
    if (!option.isDefault || tagged) return { ...option, isDefault: false };
    tagged = true;
    return option;
  });
}
