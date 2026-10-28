import { describe, expect, it } from 'vitest';
import { cleanDeviceName, listDevices, type RawDevice } from '../../src/renderer/src/devices';
import { typeaheadIndex } from '../../src/renderer/ui/keyboard';

describe('cleanDeviceName', () => {
  it('drops the role prefixes and the system duplicate counter', () => {
    expect(cleanDeviceName('Default - Microphone Array (2- Realtek(R) Audio)')).toBe(
      'Microphone Array (Realtek(R) Audio)',
    );
    expect(cleanDeviceName('Communications - Microphone Array (2- Realtek(R) Audio)')).toBe(
      'Microphone Array (Realtek(R) Audio)',
    );
  });

  it('keeps a name that has nothing to clean', () => {
    expect(cleanDeviceName('Integrated Webcam')).toBe('Integrated Webcam');
    expect(cleanDeviceName("Microphone (Oyedokun's S21 Hands-Free HF Audio)")).toBe(
      "Microphone (Oyedokun's S21 Hands-Free HF Audio)",
    );
  });

  it('drops the vendor and product ids a camera name can end in', () => {
    expect(cleanDeviceName('HD Pro Webcam C920 (046d:082d)')).toBe('HD Pro Webcam C920');
  });
});

describe('listDevices with the names on this machine', () => {
  const mic = (deviceId: string, label: string, groupId: string): RawDevice => ({
    deviceId,
    label,
    groupId,
  });
  const raw = [
    mic('default', 'Default - Microphone Array (2- Realtek(R) Audio)', 'g1'),
    mic('communications', 'Communications - Microphone Array (2- Realtek(R) Audio)', 'g1'),
    mic('abc', 'Microphone Array (2- Realtek(R) Audio)', 'g1'),
    mic('def', "Microphone (Oyedokun's S21 Hands-Free HF Audio)", 'g2'),
  ];

  it('lists each device once and tags the system default instead of repeating it', () => {
    expect(listDevices(raw, 'Microphone')).toEqual([
      { deviceId: 'abc', label: 'Microphone Array (Realtek(R) Audio)', isDefault: true },
      {
        deviceId: 'def',
        label: "Microphone (Oyedokun's S21 Hands-Free HF Audio)",
        isDefault: false,
      },
    ]);
  });

  it('never keeps the default or communications entries', () => {
    const ids = listDevices(raw, 'Microphone').map((device) => device.deviceId);
    expect(ids).not.toContain('default');
    expect(ids).not.toContain('communications');
  });

  it('matches the default by name when the group id is missing', () => {
    const noGroups = raw.map((device) => ({ ...device, groupId: '' }));
    expect(listDevices(noGroups, 'Microphone')[0]?.isDefault).toBe(true);
  });

  it('numbers devices whose names are hidden until access is allowed', () => {
    const hidden = [mic('a', '', 'x'), mic('b', '', 'y')];
    expect(listDevices(hidden, 'Camera').map((device) => device.label)).toEqual([
      'Camera 1',
      'Camera 2',
    ]);
  });

  it('tags nothing when there is no default entry', () => {
    const cameras = [mic('cam', 'Integrated Webcam', 'c')];
    expect(listDevices(cameras, 'Camera')).toEqual([
      { deviceId: 'cam', label: 'Integrated Webcam', isDefault: false },
    ]);
  });
});

describe('typeaheadIndex', () => {
  const labels = ['Apple', 'Avocado', 'Banana', 'Blueberry', 'Cherry'];
  const none = labels.map(() => false);

  it('jumps to the first match', () => {
    expect(typeaheadIndex(labels, none, 0, 'b')).toBe(2);
  });

  it('narrows with more letters', () => {
    expect(typeaheadIndex(labels, none, 0, 'bl')).toBe(3);
  });

  it('cycles when one letter is pressed again', () => {
    expect(typeaheadIndex(labels, none, 0, 'a')).toBe(1);
    expect(typeaheadIndex(labels, none, 1, 'aa')).toBe(0);
  });

  it('skips disabled entries and returns null when nothing matches', () => {
    expect(typeaheadIndex(labels, [false, false, true, false, false], 0, 'b')).toBe(3);
    expect(typeaheadIndex(labels, none, 0, 'z')).toBeNull();
    expect(typeaheadIndex(labels, none, 0, '')).toBeNull();
  });
});
