import { Mic, Video } from 'lucide-react';
import type { Settings, SettingsPatch } from '../../../shared/settings';
import { PanelSection, Select, Switch } from '../../ui';
import type { DeviceOption } from '../hooks';
import { PlatformNote, usePlatformInfo } from '../platform';

export interface RecordPanelProps {
  settings: Settings;
  cameras: DeviceOption[];
  mics: DeviceOption[];
  onChange: (patch: SettingsPatch) => void;
}

interface DevicePickerProps {
  id: string;
  label: string;
  devices: DeviceOption[];
  value: string | null;
  enabled: boolean;
  noneText: string;
  onPick: (deviceId: string) => void;
}

function DevicePicker({ id, label, devices, value, enabled, noneText, onPick }: DevicePickerProps) {
  if (devices.length === 0) {
    return <p className="ui-help">{noneText}</p>;
  }
  // A saved id that is gone, or none yet, shows the system default, else the first device.
  const chosen = devices.some((device) => device.deviceId === value)
    ? (value ?? '')
    : ((devices.find((device) => device.isDefault) ?? devices[0])?.deviceId ?? '');
  return (
    <div className="field">
      <Select
        id={id}
        label={label}
        value={chosen}
        disabled={!enabled}
        disabledReason="Turn this on first to choose a device."
        options={devices.map((device) => ({
          value: device.deviceId,
          label: device.label,
          ...(device.isDefault ? { tag: 'Default' } : {}),
        }))}
        onChange={onPick}
      />
    </div>
  );
}

/** The only things needed before recording: camera and microphone. */
export function RecordPanel({ settings, cameras, mics, onChange }: RecordPanelProps) {
  const platform = usePlatformInfo();
  return (
    <>
      <PlatformNote text={platform.cursorEffectsNote} />
      <PanelSection title="Camera" icon={<Video size={16} strokeWidth={1.75} aria-hidden="true" />}>
        <Switch
          label="Use camera"
          checked={settings.cameraOn}
          onChange={(cameraOn) => {
            onChange({ cameraOn });
          }}
        />
        <DevicePicker
          id="camera-device"
          label="Camera to use"
          devices={cameras}
          value={settings.cameraDeviceId}
          enabled={settings.cameraOn}
          noneText="No camera found. Plug one in and it will appear here."
          onPick={(cameraDeviceId) => {
            onChange({ cameraDeviceId });
          }}
        />
      </PanelSection>

      <PanelSection
        title="Microphone"
        icon={<Mic size={16} strokeWidth={1.75} aria-hidden="true" />}
      >
        <Switch
          label="Use microphone"
          checked={settings.micOn}
          onChange={(micOn) => {
            onChange({ micOn });
          }}
        />
        <DevicePicker
          id="mic-device"
          label="Microphone to use"
          devices={mics}
          value={settings.micDeviceId}
          enabled={settings.micOn}
          noneText="No microphone found. Plug one in and it will appear here."
          onPick={(micDeviceId) => {
            onChange({ micDeviceId });
          }}
        />
      </PanelSection>
    </>
  );
}
