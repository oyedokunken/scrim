import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { arrowDirection, nextEnabledIndex, typeaheadIndex } from './keyboard';

export interface SelectOption {
  value: string;
  label: string;
  /** A small note after the label, for example Default. */
  tag?: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Names the control for assistive technology. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

const TYPE_RESET_MS = 600;

/**
 * Not a native select: a button that opens a listbox in the top layer through the Popover API. The
 * list is placed under the button with CSS anchor positioning and flips upward near the window
 * bottom. Anchor names are set through the CSSOM, because the packaged CSP forbids style attributes.
 */
export function Select({ label, value, options, onChange, disabled = false, id }: SelectProps) {
  const generated = useId();
  const listId = `${generated}-list`;
  const anchor = `--ui-select-${generated.replace(/[^a-zA-Z0-9]/g, '')}`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    button.current?.style.setProperty('anchor-name', anchor);
    list.current?.style.setProperty('position-anchor', anchor);
  }, [anchor]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const onToggle = (event: Event): void => {
      setOpen((event as ToggleEvent).newState === 'open');
    };
    element.addEventListener('toggle', onToggle);
    return () => {
      element.removeEventListener('toggle', onToggle);
    };
  }, []);

  // Focus moves into the list once it is open, onto the chosen option or else the first enabled one.
  useEffect(() => {
    if (!open) return;
    const start = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled);
    // The list is not rendered until the next frame, and a box that is not rendered cannot take focus.
    const frame = requestAnimationFrame(() => {
      items.current[start]?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
    // Only when it opens: a re-render of the parent must not pull focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    list.current?.hidePopover();
    button.current?.focus();
  };

  const move = (to: number): void => {
    items.current[to]?.focus();
  };

  const onButtonKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      list.current?.showPopover();
    }
  };

  const onListKey = (event: KeyboardEvent): void => {
    const disabledFlags = options.map((option) => option.disabled === true);
    const current = items.current.findIndex((item) => item === document.activeElement);
    const direction = arrowDirection(event.key);
    if (direction !== null && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      // The ends do not wrap: a list is not a ring.
      const next = nextEnabledIndex(disabledFlags, current, direction);
      if ((direction === 1 && next > current) || (direction === -1 && next < current)) move(next);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const order = options.map((_, index) => index);
      const target = (event.key === 'Home' ? order : order.reverse()).find(
        (index) => !disabledFlags[index],
      );
      if (target !== undefined) move(target);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(current);
      return;
    }
    if (event.key === 'Tab') {
      list.current?.hidePopover();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const text =
        now - typed.current.at > TYPE_RESET_MS ? event.key : typed.current.text + event.key;
      typed.current = { text, at: now };
      const hit = typeaheadIndex(
        options.map((option) => option.label),
        disabledFlags,
        current,
        text,
      );
      if (hit !== null) move(hit);
    }
  };

  return (
    <div className="ui-select-wrap">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        className="ui-select"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        popoverTarget={listId}
        popoverTargetAction="toggle"
        onKeyDown={onButtonKey}
      >
        <span className="ui-select-value">
          {selected?.label ?? ''}
          {selected?.tag ? <span className="ui-select-tag">{selected.tag}</span> : null}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <div
        ref={list}
        id={listId}
        popover="auto"
        role="listbox"
        aria-label={label}
        className="ui-listbox"
        onKeyDown={onListKey}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            ref={(element) => {
              items.current[index] = element;
            }}
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            aria-disabled={option.disabled === true ? true : undefined}
            className="ui-option"
            onClick={() => {
              choose(index);
            }}
          >
            <span className="ui-option-check" aria-hidden="true">
              {option.value === value ? <Check size={16} strokeWidth={2} /> : null}
            </span>
            <span className="ui-option-label">{option.label}</span>
            {option.tag ? <span className="ui-select-tag">{option.tag}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
