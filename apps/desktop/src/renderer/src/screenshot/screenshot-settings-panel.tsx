import { Button, PanelSection } from '../../ui';

export interface ScreenshotSettingsPanelProps {
  /** The folder the person chose, or null for the default one. */
  folder: string | null;
  onChooseFolder: () => void;
}

/** The right panel of the Screenshot page: where screenshots are saved. */
export function ScreenshotSettingsPanel({ folder, onChooseFolder }: ScreenshotSettingsPanelProps) {
  return (
    <div className="panel-body">
      <PanelSection
        title="Save to"
        help="Every screenshot is saved here and copied to the clipboard."
      >
        <p className="folder">{folder ?? 'Pictures\\Scrim'}</p>
        <Button onClick={onChooseFolder}>Change folder</Button>
      </PanelSection>
    </div>
  );
}
