import { Camera } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui';
import { ErrorNotice } from '../components/error-notice';
import type { UserError } from '../hooks';
import { ScreenshotEditor } from '../screenshot/screenshot-editor';
import { ScreenshotResult } from '../screenshot/screenshot-result';
import { SHORTCUTS } from './shortcuts';
import { Stage } from './stage';

export interface ShotInfo {
  path: string;
  width: number;
  height: number;
}

export interface ScreenshotViewProps {
  busy: boolean;
  error: UserError | null;
  onTake: () => void;
  /** The screenshot that was just taken, if any. */
  shot?: ShotInfo | null;
  /** Forget the shot, which returns to the stage. */
  onClearShot?: () => void;
}

/**
 * The same pattern as the Record view: one box, one button inside it, the shortcut in its corner.
 * After a capture the box gives way to the result, and the result to the editor.
 */
export function ScreenshotView({
  busy,
  error,
  onTake,
  shot = null,
  onClearShot,
}: ScreenshotViewProps) {
  const [editing, setEditing] = useState(false);
  // The editor writes a new file, so the result then shows the edited one.
  const [edited, setEdited] = useState<ShotInfo | null>(null);
  const shown = edited ?? shot;

  if (shown !== null && editing) {
    return (
      <ScreenshotEditor
        path={shown.path}
        onClose={() => {
          setEditing(false);
        }}
        onSaved={(path, size) => {
          setEdited({ path, ...size });
          setEditing(false);
        }}
      />
    );
  }

  if (shown !== null) {
    return (
      <ScreenshotResult
        path={shown.path}
        width={shown.width}
        height={shown.height}
        onEdit={() => {
          setEditing(true);
        }}
        onDone={() => {
          setEdited(null);
          onClearShot?.();
        }}
      />
    );
  }

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
