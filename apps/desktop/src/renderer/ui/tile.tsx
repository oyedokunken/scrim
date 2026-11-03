import type { ReactNode } from 'react';
import { Button } from './button';

export interface TileProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** The illustration. Decorative: the label names the tile. */
  children: ReactNode;
  disabled?: boolean;
  /** Why the tile is disabled, shown on hover and keyboard focus. */
  disabledReason?: string | undefined;
}

export function Tile({
  label,
  selected,
  onSelect,
  children,
  disabled = false,
  disabledReason,
}: TileProps) {
  return (
    <Button
      bare
      aria-pressed={selected}
      disabled={disabled}
      disabledReason={disabledReason}
      className={selected ? 'ui-tile selected' : 'ui-tile'}
      onClick={onSelect}
    >
      <span className="ui-tile-art" aria-hidden="true">
        {children}
      </span>
      <span className="ui-tile-label">{label}</span>
    </Button>
  );
}
