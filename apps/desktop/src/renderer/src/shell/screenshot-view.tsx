import { Camera } from 'lucide-react';
import { Button } from '../../ui';
import { ErrorNotice } from '../components/error-notice';
import type { UserError } from '../hooks';
import { SHORTCUTS } from './shortcuts';
import { Stage } from './stage';

export interface ScreenshotViewProps {
  busy: boolean;
  error: UserError | null;
  onTake: () => void;
}

/** The same pattern as the Record view: one box, one button inside it, the shortcut in its corner. */
export function ScreenshotView({ busy, error, onTake }: ScreenshotViewProps) {
  return (
    <div className="record-view">
      <Stage
        icon={<Camera size={48} strokeWidth={1.5} />}
        label="Take a screenshot"
        text="Capture a region, a window or the whole screen"
        shortcut={SHORTCUTS.screenshot.keys}
        action={
          <Button variant="primary" className="record-button" disabled={busy} onClick={onTake}>
            {busy ? 'Opening...' : 'Take screenshot'}
          </Button>
        }
      />
      {error === null ? null : <ErrorNotice error={error} />}
    </div>
  );
}
