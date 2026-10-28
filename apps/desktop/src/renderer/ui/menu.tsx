import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Tooltip } from './tooltip';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Dangerous actions are drawn in the error color. They still ask first, in a confirm dialog. */
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  /** Names the button for assistive technology and in its tooltip, for example "More for Take 1". */
  label: string;
  items: readonly MenuItem[];
}

/**
 * A small actions menu: an icon button that opens a list in the top layer through the Popover API,
 * placed with CSS anchor positioning. Arrow keys move, Enter chooses, Escape and an outside click close it.
 */
export function Menu({ label, items }: MenuProps) {
  const generated = useId();
  const listId = `${generated}-menu`;
  const anchor = `--ui-menu-${generated.replace(/[^a-zA-Z0-9]/g, '')}`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    button.current?.style.setProperty('anchor-name', anchor);
    list.current?.style.setProperty('position-anchor', anchor);
  }, [anchor]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const onToggle = (event: Event): void => {
      if ((event as ToggleEvent).newState === 'open') {
        requestAnimationFrame(() => {
          rows.current[0]?.focus();
        });
      }
    };
    element.addEventListener('toggle', onToggle);
    return () => {
      element.removeEventListener('toggle', onToggle);
    };
  }, []);

  const choose = (item: MenuItem): void => {
    list.current?.hidePopover();
    button.current?.focus();
    item.onSelect();
  };

  const onListKey = (event: KeyboardEvent): void => {
    const current = rows.current.findIndex((row) => row === document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (current + step + items.length) % items.length;
      rows.current[next]?.focus();
    } else if (event.key === 'Tab') {
      list.current?.hidePopover();
    }
  };

  return (
    <span className="ui-menu-wrap">
      <Tooltip label={label}>
        <button
          ref={button}
          type="button"
          className="icon-button"
          aria-label={label}
          aria-haspopup="menu"
          popoverTarget={listId}
          popoverTargetAction="toggle"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              list.current?.showPopover();
            }
          }}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
      <div
        ref={list}
        id={listId}
        popover="auto"
        role="menu"
        aria-label={label}
        className="ui-listbox ui-menu"
        onKeyDown={onListKey}
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            ref={(element) => {
              rows.current[index] = element;
            }}
            type="button"
            role="menuitem"
            className={
              item.danger === true ? 'ui-option ui-menu-item danger' : 'ui-option ui-menu-item'
            }
            onClick={() => {
              choose(item);
            }}
          >
            {item.icon === undefined ? null : (
              <span className="ui-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="ui-option-label">{item.label}</span>
          </button>
        ))}
      </div>
    </span>
  );
}
