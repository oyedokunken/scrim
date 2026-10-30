import {
  FolderOpen,
  Image,
  Mic,
  MousePointer2,
  Settings,
  Video,
  Webcam,
  ZoomIn,
  Crop,
  type LucideIcon,
} from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { arrowDirection, nextEnabledIndex } from '../../ui/keyboard';
import { VIEW_IDS, VIEW_LABELS, type RailViewId, type ViewId } from './views';

const ICONS: Record<RailViewId, LucideIcon> = {
  record: Video,
  screenshot: Crop,
  cursor: MousePointer2,
  zoom: ZoomIn,
  camera: Webcam,
  audio: Mic,
  background: Image,
  library: FolderOpen,
  settings: Settings,
};

/** Library and Settings stay pinned at the bottom, the rest scrolls inside the rail. */
const BOTTOM = new Set<RailViewId>(['library', 'settings']);

export interface RailProps {
  view: ViewId;
  onView: (view: ViewId) => void;
  /** Shows a small pill on the Settings item when an update is waiting. */
  updatePill?: boolean;
  onUpdatePill?: (() => void) | undefined;
}

/** A vertical toolbar. Arrow keys move between items and select as they go, as tabs do. */
export function Rail({ view, onView, updatePill = false, onUpdatePill }: RailProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number): void => {
    const direction = arrowDirection(event.key);
    if (direction === null) return;
    event.preventDefault();
    const target = nextEnabledIndex(
      VIEW_IDS.map(() => false),
      index,
      direction,
    );
    const next = VIEW_IDS[target];
    if (next) {
      onView(next);
      refs.current[target]?.focus();
    }
  };

  const renderItem = (id: RailViewId, index: number) => {
    const Icon = ICONS[id];
    const selected = id === view;
    return (
      <div key={id} className="rail-group">
        <button
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          className={selected ? 'rail-item selected' : 'rail-item'}
          aria-current={selected ? 'page' : undefined}
          tabIndex={selected || (view === 'editor' && index === 0) ? 0 : -1}
          onClick={() => {
            onView(id);
          }}
          onKeyDown={(event) => {
            onKeyDown(event, index);
          }}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="rail-label">{VIEW_LABELS[id]}</span>
        </button>
        {id === 'settings' && updatePill ? (
          <button
            type="button"
            className="update-pill update-pill-rail"
            aria-label="New update available"
            title="New update available"
            onClick={onUpdatePill}
          >
            Update
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-top">
        {VIEW_IDS.map((id, index) => (BOTTOM.has(id) ? null : renderItem(id, index)))}
      </div>
      <div className="rail-bottom">
        {VIEW_IDS.map((id, index) => (BOTTOM.has(id) ? renderItem(id, index) : null))}
      </div>
    </nav>
  );
}
