import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { Keycaps } from './keycap';

export interface TooltipProps {
  /** What the control does. An icon only button needs it twice: as its name and here. */
  label: string;
  /** The shortcut, shown as keycaps after the label. */
  keys?: readonly string[];
  /** Where it sits. `bottom-end` lines its right edge up with the control, for one at the window edge. */
  side?: 'bottom' | 'bottom-end' | 'top' | 'right';
  children: ReactElement;
}

const TOOLTIP_DELAY_MS = 400;

/**
 * A label that appears after 400 ms of hover or keyboard focus and goes away on leave, blur, click
 * or Escape. It is placed with CSS anchor positioning and flips when it would leave the window.
 */
export function Tooltip({ label, keys, side = 'bottom', children }: TooltipProps) {
  const generated = useId();
  const anchor = `--ui-tip-${generated.replace(/[^a-zA-Z0-9]/g, '')}`;
  const host = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    host.current?.style.setProperty('anchor-name', anchor);
  }, [anchor]);

  useEffect(() => {
    tip.current?.style.setProperty('position-anchor', anchor);
  }, [anchor, shown]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const show = (): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setShown(true);
    }, TOOLTIP_DELAY_MS);
  };
  const hide = (): void => {
    window.clearTimeout(timer.current);
    setShown(false);
  };

  return (
    <span
      ref={host}
      className="ui-tooltip-host"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        // A click focuses too, but the pointer path has already decided. Keyboard focus only.
        if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) show();
      }}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      {children}
      {shown ? (
        <span ref={tip} role="tooltip" className={`ui-tooltip ui-tooltip-${side}`}>
          {label}
          {keys === undefined ? null : <Keycaps keys={keys} />}
        </span>
      ) : null}
    </span>
  );
}
