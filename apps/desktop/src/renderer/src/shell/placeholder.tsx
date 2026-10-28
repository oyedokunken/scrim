import type { ViewId } from './views';

const TEXT: Partial<Record<ViewId, string>> = {
  screenshot: 'Screenshots you take will show up here.',
  library: 'No recordings yet. Everything you record or capture will be listed here.',
  settings: 'Shortcuts, folders and the welcome screen will be here.',
};

export interface PlaceholderProps {
  view: ViewId;
  /** In the right panel the text is shorter and sits at the top. */
  inPanel?: boolean;
}

/** A calm empty state for a view whose content is built by a later step. */
export function Placeholder({ view, inPanel = false }: PlaceholderProps) {
  const text = TEXT[view] ?? 'These settings arrive with the editor.';
  if (inPanel) {
    return (
      <div className="panel-body">
        <p className="ui-help">{text}</p>
      </div>
    );
  }
  return (
    <div className="placeholder">
      <p className="ui-help">{text}</p>
    </div>
  );
}
