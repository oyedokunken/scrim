import { PanelSection } from '../../ui';

/** The right panel of the Screenshot page. The save folder sits beside the page title. */
export function ScreenshotSettingsPanel() {
  return (
    <div className="panel-body">
      <PanelSection
        title="Saving"
        help="Every screenshot is saved to your folder and copied to the clipboard."
      >
        <p className="ui-help">Change the folder at the top right of this page.</p>
      </PanelSection>
    </div>
  );
}
