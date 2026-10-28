import { BACKGROUND_PRESETS } from '@scrim/core/render';
import { ImagePlus } from 'lucide-react';
import { PanelSection, Segmented, Switch } from '../../ui';

type BackgroundPadding = 'none' | 'small' | 'medium' | 'large';
type BackgroundCorners = 'square' | 'soft' | 'round';

export interface BackgroundValue {
  /** A preset id from the render constants, or `none` for the recording alone. */
  id: string;
  padding: BackgroundPadding;
  corners: BackgroundCorners;
  shadow: boolean;
}

export interface BackgroundPanelProps {
  value: BackgroundValue;
  onChange: (value: BackgroundValue) => void;
}

const PADDING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const;

const CORNER_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Round' },
] as const;

export const NO_BACKGROUND = 'none';

/** The class that paints a preset. One class per id, defined in the stylesheet with palette colors. */
export function backgroundClass(id: string): string {
  return BACKGROUND_PRESETS.some((preset) => preset.id === id) ? `bg-${id}` : 'bg-deep-green';
}

/** A swatch grid of the presets, then padding, corners and shadow. */
export function BackgroundPanel({ value, onChange }: BackgroundPanelProps) {
  const none = value.id === NO_BACKGROUND;
  return (
    <>
      <PanelSection title="Background" help="What shows around your recording.">
        <div className="swatch-grid" role="radiogroup" aria-label="Background">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={value.id === preset.id}
              aria-label={preset.label}
              className={`bg-swatch ${backgroundClass(preset.id)}${value.id === preset.id ? ' selected' : ''}`}
              onClick={() => {
                onChange({ ...value, id: preset.id });
              }}
            />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={none}
            aria-label="None"
            className={`bg-swatch bg-none${none ? ' selected' : ''}`}
            onClick={() => {
              onChange({ ...value, id: NO_BACKGROUND });
            }}
          >
            None
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={false}
            aria-label="Your image, coming soon"
            disabled
            className="bg-swatch bg-image"
          >
            <ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <p className="ui-help">Using your own image is coming soon.</p>
      </PanelSection>
      <PanelSection title="Padding">
        <Segmented
          label="Padding"
          options={PADDING_OPTIONS.map((option) => ({ ...option, disabled: none }))}
          value={value.padding}
          onChange={(padding) => {
            onChange({ ...value, padding });
          }}
        />
      </PanelSection>
      <PanelSection title="Corners">
        <Segmented
          label="Corners"
          options={CORNER_OPTIONS.map((option) => ({ ...option, disabled: none }))}
          value={value.corners}
          onChange={(corners) => {
            onChange({ ...value, corners });
          }}
        />
      </PanelSection>
      <PanelSection title="Shadow">
        <Switch
          label="Soft shadow"
          checked={value.shadow}
          disabled={none}
          onChange={(shadow) => {
            onChange({ ...value, shadow });
          }}
        />
      </PanelSection>
    </>
  );
}
