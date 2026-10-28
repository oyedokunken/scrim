import { Keycaps } from '../../ui';
import { SHORTCUTS } from './shortcuts';

export interface StatusBarProps {
  /** Ready, Recording 0:42, Exporting 42 percent. */
  state: string;
  /** Where recordings are saved, for people to read, for example Videos\Scrim. */
  folder: string;
}

export function StatusBar({ state, folder }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-state" role="status">
        {state}
      </span>
      <span className="status-folder">Saved in {folder}</span>
      <span className="status-end">
        <span>Nothing leaves this PC</span>
        <Keycaps keys={SHORTCUTS.record.keys} />
        <Keycaps keys={SHORTCUTS.stop.keys} />
      </span>
    </footer>
  );
}
