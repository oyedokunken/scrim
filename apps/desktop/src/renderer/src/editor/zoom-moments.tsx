import { Plus, Trash2 } from 'lucide-react';
import type { ZoomMoment } from '@scrim/core/zoom';
import { momentKind } from '@scrim/core/zoom';
import { Button, Tooltip } from '../../ui';
import { formatTimer } from '../format';

export interface ZoomMomentsProps {
  moments: readonly ZoomMoment[];
  /** Times of the left clicks, to say which moments came from a click. */
  clickTimes: readonly number[];
  selected: number | null;
  /** False when zoom is off or the mouse was not logged. */
  enabled: boolean;
  offReason: string | null;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onReset: () => void;
  edited: boolean;
}

/** The list of zoom moments with the same moments drawn as blocks on the timeline. */
export function ZoomMoments(props: ZoomMomentsProps) {
  const { moments } = props;
  return (
    <section className="ui-section" aria-label="Zoom moments">
      <h2 className="ui-section-title">Zoom moments</h2>
      {props.offReason === null ? null : <p className="ui-help">{props.offReason}</p>}
      {props.offReason === null && moments.length === 0 ? (
        <p className="ui-help">There are no zooms. Add one at the playhead.</p>
      ) : null}
      <ul className="moment-list">
        {moments.map((moment, index) => (
          <li
            key={`${String(moment.startMs)}-${String(index)}`}
            className={index === props.selected ? 'moment selected' : 'moment'}
          >
            <button
              type="button"
              className="moment-main"
              onClick={() => {
                props.onSelect(index);
              }}
            >
              <span className="moment-time">{formatTimer(moment.startMs)}</span>
              <span className="moment-kind">
                {momentKind(moment, props.clickTimes) === 'click' ? 'Click' : 'Added'}
              </span>
            </button>
            <Tooltip label="Delete this zoom">
              <button
                type="button"
                className="moment-delete"
                aria-label={`Delete the zoom at ${formatTimer(moment.startMs)}`}
                onClick={() => {
                  props.onDelete(index);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      <div className="moment-actions">
        <Button icon={<Plus size={16} />} onClick={props.onAdd} disabled={!props.enabled}>
          Add zoom here
        </Button>
        {props.edited ? (
          <Button variant="ghost" onClick={props.onReset}>
            Reset zooms
          </Button>
        ) : null}
      </div>
    </section>
  );
}
