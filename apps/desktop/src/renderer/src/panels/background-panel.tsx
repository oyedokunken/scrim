import { BACKGROUND_PRESETS } from '@scrim/core/render';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MAX_BACKGROUNDS, customBackgroundId } from '../../../shared/backgrounds-contract';
import { Button, ConfirmDialog, PanelSection, Segmented, Switch } from '../../ui';
import { useBackgroundImages } from './use-backgrounds';

type BackgroundPadding = 'none' | 'small' | 'medium' | 'large';
type BackgroundCorners = 'square' | 'soft' | 'round';

export interface BackgroundValue {
  /** A preset id from the render constants, `none` for the recording alone, or `image:` and the id of the person's own picture. */
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

/** A swatch grid of the presets and the person's own images, then padding, corners and shadow. */
export function BackgroundPanel({ value, onChange }: BackgroundPanelProps) {
  const none = value.id === NO_BACKGROUND;
  const { images, add, remove } = useBackgroundImages();
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const selected = images.find((image) => customBackgroundId(image.id) === value.id);

  const addImage = (): void => {
    setProblem(null);
    void add().then((outcome) => {
      if (outcome.ok) onChange({ ...value, id: customBackgroundId(outcome.background.id) });
      else if (outcome.reason !== 'cancelled') setProblem(outcome.message);
    });
  };

  return (
    <>
      <PanelSection title="Background">
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
          {images.map((image) => {
            const id = customBackgroundId(image.id);
            return (
              <button
                key={image.id}
                type="button"
                role="radio"
                aria-checked={value.id === id}
                aria-label={`Your image ${image.name}`}
                className={`bg-swatch bg-user${value.id === id ? ' selected' : ''}`}
                onClick={() => {
                  onChange({ ...value, id });
                }}
              >
                {image.url === null ? null : (
                  <img className="bg-swatch-image" src={image.url} alt="" draggable={false} />
                )}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Add your own image"
            className="bg-swatch bg-image"
            disabled={images.length >= MAX_BACKGROUNDS}
            onClick={addImage}
          >
            <ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {problem === null ? null : (
          <p className="panel-error" role="alert">
            {problem}
          </p>
        )}
        {selected === undefined ? null : (
          <Button
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            onClick={() => {
              setRemoving(true);
            }}
          >
            Remove this image
          </Button>
        )}
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
      <ConfirmDialog
        open={removing && selected !== undefined}
        title="Remove this image?"
        confirmLabel="Remove image"
        destructive
        onCancel={() => {
          setRemoving(false);
        }}
        onConfirm={() => {
          setRemoving(false);
          if (selected === undefined) return;
          onChange({ ...value, id: BACKGROUND_PRESETS[0]?.id ?? NO_BACKGROUND });
          void remove(selected.id);
        }}
      >
        <p>
          Scrim deletes its copy of the image. Videos and screenshots you already saved keep their
          look, and your original file is not touched.
        </p>
      </ConfirmDialog>
    </>
  );
}
