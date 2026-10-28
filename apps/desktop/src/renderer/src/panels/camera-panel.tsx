import { PanelSection, Segmented, Switch } from '../../ui';

export type BubbleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type BubbleSize = 'S' | 'M' | 'L';
export type BubbleShape = 'circle' | 'rounded-square';

export interface CameraValue {
  on: boolean;
  size: BubbleSize;
  shape: BubbleShape;
  corner: BubbleCorner;
}

export interface CameraPanelProps {
  value: CameraValue;
  onChange: (value: CameraValue) => void;
  /** Why the switch cannot be used, for example a recording with no camera track. */
  disabledNote?: string;
}

const SIZE_OPTIONS = [
  { value: 'S', label: 'Small' },
  { value: 'M', label: 'Medium' },
  { value: 'L', label: 'Large' },
] as const;

const SHAPE_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'rounded-square', label: 'Rounded' },
] as const;

export const CORNERS: readonly { value: BubbleCorner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

export interface CornerPickerProps {
  value: BubbleCorner;
  onChange: (corner: BubbleCorner) => void;
  disabled?: boolean;
}

/** A small frame with a dot in each corner. The chosen corner is filled. */
export function CornerPicker({ value, onChange, disabled = false }: CornerPickerProps) {
  return (
    <div className="corner-picker" role="radiogroup" aria-label="Bubble position">
      {CORNERS.map((corner) => (
        <button
          key={corner.value}
          type="button"
          role="radio"
          aria-checked={value === corner.value}
          aria-label={corner.label}
          disabled={disabled}
          className={`corner-dot corner-${corner.value}${value === corner.value ? ' selected' : ''}`}
          onClick={() => {
            onChange(corner.value);
          }}
        />
      ))}
    </div>
  );
}

/** Show the camera, its size and shape, and the corner. Used on the Camera page and in the editor. */
export function CameraPanel({ value, onChange, disabledNote }: CameraPanelProps) {
  const locked = disabledNote !== undefined;
  const off = !value.on || locked;
  return (
    <>
      <PanelSection title="Camera" help="Your face in a small bubble over the recording.">
        <Switch
          label="Show camera"
          checked={value.on}
          disabled={locked}
          {...(disabledNote === undefined ? {} : { note: disabledNote })}
          onChange={(on) => {
            onChange({ ...value, on });
          }}
        />
      </PanelSection>
      <PanelSection title="Size">
        <Segmented
          label="Bubble size"
          options={SIZE_OPTIONS.map((option) => ({ ...option, disabled: off }))}
          value={value.size}
          onChange={(size) => {
            onChange({ ...value, size });
          }}
        />
      </PanelSection>
      <PanelSection title="Shape">
        <Segmented
          label="Bubble shape"
          options={SHAPE_OPTIONS.map((option) => ({ ...option, disabled: off }))}
          value={value.shape}
          onChange={(shape) => {
            onChange({ ...value, shape });
          }}
        />
      </PanelSection>
      <PanelSection title="Position" help="Or drag the bubble in the preview.">
        <CornerPicker
          value={value.corner}
          disabled={off}
          onChange={(corner) => {
            onChange({ ...value, corner });
          }}
        />
      </PanelSection>
    </>
  );
}
