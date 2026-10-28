import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '../brand-mark';

export interface HeaderProps {
  /** The view title, or the recording name in the editor. */
  title: string;
  /** View controls, such as the editor's Before, Compare and After. */
  center?: ReactNode;
  /** The primary action of the current view, a green button. */
  primary?: ReactNode;
  onHelp: () => void;
}

export function Header({ title, center, primary, onHelp }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-header-brand">
          <BrandMark />
          Scrim
        </span>
        <h1 className="app-header-title">{title}</h1>
      </div>
      <div className="app-header-center">{center}</div>
      <div className="app-header-right">
        {primary}
        <button
          type="button"
          className="icon-button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          onClick={onHelp}
        >
          <CircleHelp size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
