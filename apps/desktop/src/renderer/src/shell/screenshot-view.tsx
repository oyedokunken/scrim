import { Camera } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui';
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
  onTake: () => void;
  /** The screenshot that was just taken, if any. */
  shot?: ShotInfo | null;
  /** Forget the shot, which returns to the stage. */
  onClearShot?: () => void;
  /** The shown shot changed: the editor saved a new file. The list reads again. */
  onShot?: (shot: ShotInfo) => void;
  /** Opens straight in the editor, for a screenshot opened from the Library. */
  startEditing?: boolean;
  /** Leaves the editor for the page the person came from, instead of showing the result. */
  onLeaveEditor?: (() => void) | undefined;
  /** The folder screenshots are saved to, or null for the default. */
  folder?: string | null;
  onChooseFolder?: (() => void) | undefined;
}

/**
 * The same pattern as the Record view: one box, one button inside it, the shortcut in its corner.
 * After a capture the box gives way to the result, and the result to the editor.
 */
export function ScreenshotView({
  busy,
  onTake,
  shot = null,
  onClearShot,
  onShot,
  startEditing = false,
  onLeaveEditor,
  folder = null,
  onChooseFolder,
}: ScreenshotViewProps) {
  const [editing, setEditing] = useState(startEditing);
  const shown = shot;

  if (shown !== null && editing) {
    return (
      <ScreenshotEditor
        path={shown.path}
        onClose={() => {
          setEditing(false);
          onLeaveEditor?.();
        }}
        onSaved={(path, size) => {
          setEditing(false);
          if (onLeaveEditor) onLeaveEditor();
          else onShot?.({ path, ...size });
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
      {onChooseFolder === undefined ? null : (
        <div className="save-to">
          <span className="save-to-label">Save to</span>
          <p className="folder" title={folder ?? undefined}>
            {folder ?? 'Pictures\\Scrim'}
          </p>
          <Button onClick={onChooseFolder}>Change folder</Button>
        </div>
      )}
    </div>
  );
}
