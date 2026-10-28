import { PanelSection, Segmented, Switch } from '../../ui';

type MicVolume = 'quieter' | 'normal' | 'louder';

export interface AudioValue {
  keepSound: boolean;
  volume: MicVolume;
}

export interface AudioPanelProps {
  value: AudioValue;
  onChange: (value: AudioValue) => void;
}

const VOLUME_OPTIONS = [
  { value: 'quieter', label: 'Quieter' },
  { value: 'normal', label: 'Normal' },
  { value: 'louder', label: 'Louder' },
] as const;

/** Keep sound and microphone volume. Used on the Audio page and in the editor. */
export function AudioPanel({ value, onChange }: AudioPanelProps) {
  return (
    <>
      <PanelSection title="Sound" help="Turn it off to export a video with no audio.">
        <Switch
          label="Keep sound"
          checked={value.keepSound}
          onChange={(keepSound) => {
            onChange({ ...value, keepSound });
          }}
        />
      </PanelSection>
      <PanelSection title="Microphone volume">
        <Segmented
          label="Microphone volume"
          options={VOLUME_OPTIONS.map((option) => ({ ...option, disabled: !value.keepSound }))}
          value={value.volume}
          onChange={(volume) => {
            onChange({ ...value, volume });
          }}
        />
      </PanelSection>
    </>
  );
}
