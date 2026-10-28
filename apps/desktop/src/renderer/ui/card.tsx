import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card one button. Leave out for a plain surface. */
  onOpen?: () => void;
  label?: string;
}

export function Card({ children, onOpen, label }: CardProps) {
  if (!onOpen) return <div className="ui-card">{children}</div>;
  return (
    <button type="button" className="ui-card ui-card-button" aria-label={label} onClick={onOpen}>
      {children}
    </button>
  );
}
