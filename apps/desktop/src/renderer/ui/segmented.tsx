import { useRef, type KeyboardEvent } from 'react';
import { arrowDirection, nextEnabledIndex } from './keyboard';
import { Tooltip } from './tooltip';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** A class that paints a color dot before the label, for choosing a color. */
  swatch?: string;
  /** Shows only the dot. The label still names the option for assistive technology. */
  hideLabel?: boolean;
  /** A fuller name, shown as a tooltip on hover and keyboard focus and used as the accessible name. */
  hint?: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** An extra class for the track, for a page that sizes its choices differently. */
  className?: string;
}

/** A radio group drawn as one track. Arrow keys move the choice, as a native radio group does. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number): void => {
    const direction = arrowDirection(event.key);
    if (direction === null) return;
    event.preventDefault();
    const target = nextEnabledIndex(
      options.map((option) => option.disabled === true),
      index,
      direction,
    );
    const option = options[target];
    if (option) {
      onChange(option.value);
      refs.current[target]?.focus();
    }
  };

  return (
    <div
      className={className === undefined ? 'ui-segmented' : `ui-segmented ${className}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const name = option.hideLabel === true ? option.label : option.hint;
        const tip = option.hint ?? (option.hideLabel === true ? option.label : undefined);
        const control = (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled === true}
            aria-label={name}
            className={selected ? 'ui-segment selected' : 'ui-segment'}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
          >
            {option.swatch === undefined ? null : (
              <span className={`ui-swatch ${option.swatch}`} aria-hidden="true" />
            )}
            {option.hideLabel === true ? null : option.label}
          </button>
        );
        return tip === undefined ? (
          control
        ) : (
          <Tooltip key={option.value} label={tip}>
            {control}
          </Tooltip>
        );
      })}
    </div>
  );
}
