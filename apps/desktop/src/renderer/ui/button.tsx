import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  /** Drops the shared button look, for the few buttons that carry their own classes. */
  bare?: boolean;
  /** Shown before the label. Decorative, so it is hidden from assistive technology. */
  icon?: ReactNode;
  /**
   * Why the button is disabled, in plain words. While `disabled` is true the reason shows on hover
   * and on keyboard focus, and the button stays focusable (it is `aria-disabled`, not `disabled`)
   * so a keyboard user can reach the reason. Every disabled button in the app gives one.
   */
  disabledReason?: string | undefined;
}

export function Button({
  variant = 'secondary',
  bare = false,
  icon,
  className,
  children,
  type = 'button',
  disabled,
  disabledReason,
  onClick,
  ref: outerRef,
  onKeyDown,
  onBlur,
  onPointerLeave,
  ...rest
}: ButtonProps) {
  const classes = (bare ? [className] : ['ui-button', `ui-button-${variant}`, className])
    .filter(Boolean)
    .join(' ');
  const blocked = disabled === true && disabledReason !== undefined && disabledReason !== '';
  const generated = useId();
  const reasonId = `ui-reason-${generated.replace(/[^a-zA-Z0-9]/g, '')}`;
  const anchor = `--${reasonId}`;
  const node = useRef<HTMLButtonElement | null>(null);
  const tip = useRef<HTMLSpanElement | null>(null);
  // Escape hides the reason until the pointer or the focus leaves and comes back.
  const [dismissed, setDismissed] = useState(false);

  useImperativeHandle(outerRef, () => node.current as HTMLButtonElement, []);

  useEffect(() => {
    node.current?.style.setProperty('anchor-name', anchor);
    tip.current?.style.setProperty('position-anchor', anchor);
  }, [anchor, blocked]);

  const describedBy = [rest['aria-describedby'], blocked ? reasonId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      ref={node}
      type={type}
      className={classes}
      disabled={blocked ? undefined : disabled}
      aria-disabled={blocked ? true : undefined}
      aria-describedby={describedBy === '' ? undefined : describedBy}
      data-dismissed={blocked && dismissed ? 'true' : undefined}
      onClick={(event) => {
        if (blocked) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (blocked && event.key === 'Escape' && !dismissed) {
          setDismissed(true);
          event.stopPropagation();
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        setDismissed(false);
        onBlur?.(event);
      }}
      onPointerLeave={(event) => {
        setDismissed(false);
        onPointerLeave?.(event);
      }}
    >
      {icon ? (
        <span className="ui-button-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
      {blocked ? (
        // Hidden from the name of the button, and read as its description through aria-describedby.
        <span ref={tip} id={reasonId} className="ui-reason" aria-hidden="true">
          {disabledReason}
        </span>
      ) : null}
    </button>
  );
}
