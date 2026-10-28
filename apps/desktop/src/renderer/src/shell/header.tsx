import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '../../ui';
import { BrandMark } from '../brand-mark';

export interface HeaderProps {
  /** The editable recording name, shown after the brand in the editor only. */
  recordingName?: ReactNode;
  /** View controls, such as the editor's Before, Compare and After. */
  center?: ReactNode;
  /** The primary action of the current view, a green button. */
  primary?: ReactNode;
  onHelp: () => void;
}

export function Header({ recordingName, center, primary, onHelp }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-header-brand">
          <BrandMark />
          Scrim
        </span>
        {recordingName === undefined ? null : (
          <span className="app-header-name">{recordingName}</span>
        )}
      </div>
      <div className="app-header-center">{center}</div>
      <div className="app-header-right">
        {primary}
        <Tooltip label="Keyboard shortcuts" side="bottom-end">
          <button
            type="button"
            className="icon-button"
            aria-label="Keyboard shortcuts"
            onClick={onHelp}
          >
            <CircleHelp size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
