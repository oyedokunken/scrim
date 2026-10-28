import type { ReactNode } from 'react';

export interface TileProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** The illustration. Decorative: the label names the tile. */
  children: ReactNode;
  disabled?: boolean;
}

export function Tile({ label, selected, onSelect, children, disabled = false }: TileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      className={selected ? 'ui-tile selected' : 'ui-tile'}
      onClick={onSelect}
    >
      <span className="ui-tile-art" aria-hidden="true">
        {children}
      </span>
      <span className="ui-tile-label">{label}</span>
    </button>
  );
}
