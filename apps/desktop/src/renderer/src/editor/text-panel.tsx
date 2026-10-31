import { Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { TEXT_LIMITS } from '@scrim/core/render';
import type { TextColor, TextItem, TextSize } from '@scrim/core/render';
import { Button, Segmented, Switch, Tooltip } from '../../ui';
import { formatTimer } from '../format';
import './text-panel.css';

export interface TextPanelProps {
  texts: readonly TextItem[];
  selectedId: string | null;
  /** The playhead on the recording clock, in milliseconds. */
  playheadMs: number;
  /** False in Before, which shows no text, so the panel says where it appears. */
  visibleInView: boolean;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<Omit<TextItem, 'id'>>) => void;
  onDelete: (id: string) => void;
}

const SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
] as const satisfies readonly { value: TextSize; label: string }[];

const COLOR_OPTIONS = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'green', label: 'Green' },
  { value: 'butter', label: 'Butter' },
] as const satisfies readonly { value: TextColor; label: string }[];

function summary(item: TextItem): string {
  return item.text.length > 28 ? `${item.text.slice(0, 27)}...` : item.text;
}

/**
 * The words field. It keeps what the person typed, spaces included, while the item holds the
 * tidied text. It is keyed by the item, so picking another item starts it fresh.
 */
function TextField({ text, onText }: { text: string; onText: (text: string) => void }) {
  const fieldId = useId();
  const [draft, setDraft] = useState(text);
  return (
    <>
      <label className="text-field-label" htmlFor={fieldId}>
        Words on screen
      </label>
      <input
        id={fieldId}
        className="text-field"
        type="text"
        value={draft}
        maxLength={TEXT_LIMITS.maxLength}
        onChange={(event) => {
          setDraft(event.target.value);
          onText(event.target.value);
        }}
        onBlur={() => {
          setDraft(text);
        }}
      />
    </>
  );
}

/** Add, edit and delete the text laid over the video. The picture and the timeline show the result. */
export function TextPanel(props: TextPanelProps) {
  const { texts, selectedId } = props;
  const selected = texts.find((item) => item.id === selectedId);

  return (
    <section className="ui-section" aria-label="Text">
      <h2 className="ui-section-title">Text</h2>
      {props.visibleInView ? null : (
        <p className="ui-help">Text shows in After. Switch the view to see it.</p>
      )}
      {texts.length === 0 ? (
        <p className="ui-help">No text yet. Add one at the playhead.</p>
      ) : (
        <ul className="moment-list">
          {texts.map((item) => (
            <li key={item.id} className={item.id === selectedId ? 'moment selected' : 'moment'}>
              <button
                type="button"
                className="moment-main"
                aria-pressed={item.id === selectedId}
                onClick={() => {
                  props.onSelect(item.id === selectedId ? null : item.id);
                }}
              >
                <span className="moment-time">{formatTimer(item.startMs)}</span>
                <span className="moment-kind">{summary(item)}</span>
              </button>
              <Tooltip label="Delete this text">
                <button
                  type="button"
                  className="moment-delete"
                  aria-label={`Delete the text ${summary(item)}`}
                  onClick={() => {
                    props.onDelete(item.id);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      <div className="moment-actions">
        <Button icon={<Plus size={16} />} onClick={props.onAdd}>
          Add text here
        </Button>
      </div>
      {selected === undefined ? null : (
        <div className="text-editor" data-testid="text-editor">
          <TextField
            key={selected.id}
            text={selected.text}
            onText={(text) => {
              props.onChange(selected.id, { text });
            }}
          />
          <p className="ui-help">
            Shows from {formatTimer(selected.startMs)} to {formatTimer(selected.endMs)}. Drag the
            text on the picture to move it, or focus it and use the arrow keys.
          </p>
          <div className="moment-actions">
            <Button
              onClick={() => {
                props.onChange(selected.id, { startMs: props.playheadMs });
              }}
            >
              Start at playhead
            </Button>
            <Button
              onClick={() => {
                props.onChange(selected.id, { endMs: props.playheadMs });
              }}
            >
              End at playhead
            </Button>
          </div>
          <Segmented
            label="Text size"
            options={SIZE_OPTIONS}
            value={selected.size}
            onChange={(size) => {
              props.onChange(selected.id, { size });
            }}
          />
          <Segmented
            label="Text color"
            options={COLOR_OPTIONS}
            value={selected.color}
            onChange={(color) => {
              props.onChange(selected.id, { color });
            }}
          />
          <Switch
            label="Background behind the text"
            checked={selected.chip}
            onChange={(chip) => {
              props.onChange(selected.id, { chip });
            }}
          />
        </div>
      )}
    </section>
  );
}
