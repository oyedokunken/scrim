import { Camera } from 'lucide-react';
import { useState } from 'react';
import { Button, PanelSection } from '../../ui';
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
  /** The folder the person chose for screenshots, or null for the default one. */
  folder: string | null;
  onChooseFolder: () => void;
  onTake: () => void;
  /** The screenshot that was just taken, if any. */
  shot?: ShotInfo | null;
  /** Forget the shot, which returns to the stage. */
  onClearShot?: () => void;
  /** The shown shot changed: the editor saved a new file. The list reads again. */
  onShot?: (shot: ShotInfo) => void;
}

/**
 * The same pattern as the Record view: one box, one button inside it, the shortcut in its corner.
 * After a capture the box gives way to the result, and the result to the editor.
 */
export function ScreenshotView({
  busy,
  folder,
  onChooseFolder,
  onTake,
  shot = null,
  onClearShot,
  onShot,
}: ScreenshotViewProps) {
  const [editing, setEditing] = useState(false);
  const shown = shot;

  if (shown !== null && editing) {
    return (
      <ScreenshotEditor
        path={shown.path}
        onClose={() => {
          setEditing(false);
        }}
        onSaved={(path, size) => {
          setEditing(false);
          onShot?.({ path, ...size });
        }}
      />
    );
  }

  const saveTo = (
    <section className="save-to" aria-label="Save to">
      <PanelSection
        title="Save to"
        help="Every screenshot is saved here and copied to the clipboard."
      >
        <p className="folder">{folder ?? 'Pictures\\Scrim'}</p>
        <Button onClick={onChooseFolder}>Change folder</Button>
      </PanelSection>
    </section>
  );

  if (shown !== null) {
    return (
      <>
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
        {saveTo}
      </>
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
      {saveTo}
    </div>
  );
}
