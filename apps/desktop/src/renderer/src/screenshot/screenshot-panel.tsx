import { useEffect, useState } from 'react';
import { formatWhen } from '../format';
import type { ShotEntry } from '../../../shared/image-contract';
import { Thumbnail } from './thumbnail';

export interface ScreenshotPanelProps {
  /** Newest first. Null while the first listing is on its way. */
  shots: readonly ShotEntry[] | null;
  /** The path of the screenshot that is open, to mark it in the list. */
  openPath: string | null;
  onOpen: (shot: ShotEntry) => void;
  /** Injected so a test can fix the clock. */
  now?: number;
}

/** The time, read again every minute so Today and Yesterday stay right. */
function useClock(): number {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTime(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return time;
}

/** The right panel of the Screenshot view: how many there are, and every one of them, newest first. */
export function ScreenshotPanel({ shots, openPath, onOpen, now }: ScreenshotPanelProps) {
  const clock = useClock();
  const current = now ?? clock;
  return (
    <div className="panel-body shot-panel">
      <h2 className="shot-panel-title">
        Screenshots
        {shots === null ? null : <span className="shot-panel-count">{String(shots.length)}</span>}
      </h2>
      {shots === null ? (
        <p className="ui-help" role="status">
          Loading
        </p>
      ) : shots.length === 0 ? (
        <p className="ui-help">Screenshots you take will show up here.</p>
      ) : (
        <ul className="shot-list">
          {shots.map((shot) => (
            <li key={shot.path}>
              <button
                type="button"
                className={shot.path === openPath ? 'shot-item selected' : 'shot-item'}
                aria-current={shot.path === openPath ? 'true' : undefined}
                onClick={() => {
                  onOpen(shot);
                }}
              >
                <Thumbnail path={shot.path} version={shot.modifiedMs} />
                <span className="shot-item-name">{shot.name}</span>
                <span className="shot-item-when">{formatWhen(shot.modifiedMs, current)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
