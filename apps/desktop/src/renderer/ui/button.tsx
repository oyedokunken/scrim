import type { ComponentPropsWithRef, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  /** Shown before the label. Decorative, so it is hidden from assistive technology. */
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['ui-button', `ui-button-${variant}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon ? (
        <span className="ui-button-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
