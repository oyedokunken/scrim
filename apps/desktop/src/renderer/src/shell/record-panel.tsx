import type { Settings, SettingsPatch } from '../../../shared/settings';
import { Button, PanelSection, Switch } from '../../ui';
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
  return (
    <div className="field">
      <label htmlFor={id} className="ui-help">
        {label}
      </label>
      <select
        id={id}
        className="ui-select"
        value={value ?? devices[0]?.deviceId ?? ''}
        disabled={!enabled}
        onChange={(event) => {
          onPick(event.target.value);
        }}
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
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
