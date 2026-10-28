import type { Settings, SettingsPatch } from '../../../shared/settings';
import { Button, PanelSection, Select, Switch } from '../../ui';
import type { DeviceOption } from '../hooks';

export interface RecordPanelProps {
  settings: Settings;
  cameras: DeviceOption[];
  mics: DeviceOption[];
  onChange: (patch: SettingsPatch) => void;
  onChooseFolder: () => void;
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
      <label htmlFor={id} className="ui-help">
        {label}
      </label>
      <Select
        id={id}
        label={label}
        value={chosen}
        disabled={!enabled}
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

/** The only things needed before recording: camera, microphone and where to save. */
export function RecordPanel({
  settings,
  cameras,
  mics,
  onChange,
  onChooseFolder,
}: RecordPanelProps) {
  return (
    <div className="panel-body">
      <PanelSection title="Camera">
        <Switch
          label="Show my face"
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

      <PanelSection title="Microphone">
        <Switch
          label="Record my voice"
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

      <PanelSection title="Save to">
        <p className="folder" title={settings.destinationFolder ?? undefined}>
          {settings.destinationFolder ?? 'Videos\\Scrim'}
        </p>
        <Button onClick={onChooseFolder}>Change folder</Button>
      </PanelSection>
    </div>
  );
}
