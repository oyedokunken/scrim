import { useState, type ReactNode } from 'react';
import { Keycaps, Sheet } from '../../ui';
import { Header } from './header';
import { Rail } from './rail';
import { SHORTCUTS } from './shortcuts';
import { StatusBar } from './status-bar';
import { hasPanel, type ViewId } from './views';

export interface AppShellProps {
  view: ViewId;
  /** The rail item to show as selected, when it is not the view itself (the editor opened from the Library). */
  railSelected?: ViewId;
  onView: (view: ViewId) => void;
  /** The view title, shown at the top of the main area. The header carries only the brand. */
  title: string;
  /** The recording name, editable, for the editor. */
  recordingName?: ReactNode;
  headerCenter?: ReactNode;
  primary?: ReactNode;
  status: { state: string; folder: string };
  /** The main area. It scrolls vertically when its content is taller. */
  children: ReactNode;
  /** The right panel for the selected rail item. Ignored on views without a panel. */
  panel?: ReactNode;
  /** Shows the New update available pill on the Settings item of the rail. */
  updatePill?: boolean;
  onUpdatePill?: (() => void) | undefined;
}

/** Header, icon rail, main area, right panel and status bar. Only the main area and the panel scroll. */
export function AppShell({
  view,
  railSelected,
  onView,
  title,
  recordingName,
  headerCenter,
  primary,
  status,
  children,
  panel,
  updatePill = false,
  onUpdatePill,
}: AppShellProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const showPanel = hasPanel(view);

  return (
    <div className={showPanel ? 'shell' : 'shell no-panel'}>
      <Header
        recordingName={recordingName}
        center={headerCenter}
        primary={primary}
        onHelp={() => {
          setHelpOpen(true);
        }}
      />
      <Rail
        view={railSelected ?? view}
        onView={onView}
        updatePill={updatePill}
        onUpdatePill={onUpdatePill}
      />
      <main className="shell-main">
        <h1 className="page-title">{title}</h1>
        {children}
      </main>
      {showPanel ? (
        <aside className="shell-panel" aria-label={`${title} settings`}>
          {panel}
        </aside>
      ) : null}
      <StatusBar state={status.state} folder={status.folder} />
      <Sheet
        open={helpOpen}
        title="Keyboard shortcuts"
        onClose={() => {
          setHelpOpen(false);
        }}
      >
        <dl className="shortcut-list">
          {Object.values(SHORTCUTS).map((shortcut) => (
            <div key={shortcut.label} className="shortcut-row">
              <dt>{shortcut.label}</dt>
              <dd>
                <Keycaps keys={shortcut.keys} />
              </dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}
