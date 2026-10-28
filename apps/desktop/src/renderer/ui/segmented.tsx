import { useRef, type KeyboardEvent } from 'react';
import { arrowDirection, nextEnabledIndex } from './keyboard';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A radio group drawn as one track. Arrow keys move the choice, as a native radio group does. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
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
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
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
            className={selected ? 'ui-segment selected' : 'ui-segment'}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
