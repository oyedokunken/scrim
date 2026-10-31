import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ZoomMoment } from '@scrim/core/zoom';
import type { TextItem } from '@scrim/core/render';
import { formatTimer } from '../format';
import type { Span } from './edits';

export interface TimelineProps {
  /** Length of the whole recording, in milliseconds. The strip always shows all of it. */
  durationMs: number;
  /** Where the playhead is, on the recording clock. */
  playheadMs: number;
  trim: Span | null;
  cuts: readonly Span[];
  moments: readonly ZoomMoment[];
  selectedMoment: number | null;
  selection: Span | null;
  /** Before shows no effects, so the zoom lane says where they went. */
  effectsHidden?: boolean;
  /** Text items to mark on the strip. Empty in Before. */
  texts?: readonly TextItem[];
  selectedText?: string | null;
  onSelectText?: (id: string) => void;
  onSeek: (recordingMs: number) => void;
  onSelectMoment: (index: number | null) => void;
  onMoveMoment: (index: number, deltaMs: number) => void;
  onResizeMoment: (index: number, edge: 'start' | 'end', timeMs: number) => void;
  onTrim: (startMs: number, endMs: number) => void;
  onSelection: (span: Span | null) => void;
  /** Reports the end of a drag, so the editor can keep one undo step per drag. */
  onGestureEnd: () => void;
}

type Drag =
  | { kind: 'seek'; fromMs: number; moved: boolean }
  | { kind: 'move'; index: number; lastMs: number }
  | { kind: 'edge'; index: number; edge: 'start' | 'end' }
  | { kind: 'trim'; edge: 'start' | 'end' };

const TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** A ruler step that gives about eight labels across the strip. */
export function tickSeconds(durationMs: number): number {
  const wanted = durationMs / 1000 / 8;
  return TICKS.find((t) => t >= wanted) ?? 900;
}

/**
 * The strip under the stage. It is drawn on the recording clock, so cut stretches stay visible
 * as hatched bands. Drag on empty strip to select a range, click to move the playhead. Zoom
 * moments are green blocks in a lane above: drag one to move it, drag its edges to change when
 * it starts or how long it holds. The trim grips sit at both ends.
 */
export function Timeline(props: TimelineProps) {
  const { durationMs, trim, cuts, moments, selection } = props;
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const total = Math.max(1, durationMs);
  const pct = (ms: number): string => `${String((ms / total) * 100)}%`;
  const trimStart = trim?.startMs ?? 0;
  const trimEnd = trim?.endMs ?? durationMs;

  const msAt = (clientX: number): number => {
    const box = strip.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return 0;
    return Math.min(durationMs, Math.max(0, ((clientX - box.left) / box.width) * durationMs));
  };

  const begin = (event: PointerEvent, next: Drag): void => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = next;
    setDragging(true);
  };

  const onStripDown = (event: PointerEvent<HTMLDivElement>): void => {
    const at = msAt(event.clientX);
    props.onSelectMoment(null);
    props.onSelection(null);
    props.onSeek(at);
    begin(event, { kind: 'seek', fromMs: at, moved: false });
  };

  const onMove = (event: PointerEvent<HTMLElement>): void => {
    const state = drag.current;
    if (state === null) return;
    const at = msAt(event.clientX);
    if (state.kind === 'seek') {
      if (Math.abs(at - state.fromMs) > (total / 400) * 3) state.moved = true;
      if (state.moved) {
        props.onSelection({
          startMs: Math.min(state.fromMs, at),
          endMs: Math.max(state.fromMs, at),
        });
      }
    } else if (state.kind === 'move') {
      props.onMoveMoment(state.index, at - state.lastMs);
      state.lastMs = at;
    } else if (state.kind === 'edge') {
      props.onResizeMoment(state.index, state.edge, at);
    } else if (state.edge === 'start') {
      props.onTrim(Math.min(at, trimEnd - 500), trimEnd);
    } else {
      props.onTrim(trimStart, Math.max(at, trimStart + 500));
    }
  };

  const onUp = (): void => {
    if (drag.current === null) return;
    drag.current = null;
    setDragging(false);
    props.onGestureEnd();
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 5000 : 1000;
    if (event.key === 'ArrowLeft') props.onSeek(Math.max(0, props.playheadMs - step));
    else if (event.key === 'ArrowRight')
      props.onSeek(Math.min(durationMs, props.playheadMs + step));
    else return;
    event.preventDefault();
  };

  const seconds = tickSeconds(durationMs);
  const ticks: number[] = [];
  for (let s = 0; s * 1000 <= durationMs; s += seconds) ticks.push(s * 1000);

  return (
    <div
      className={dragging ? 'timeline dragging' : 'timeline'}
      role="slider"
      tabIndex={0}
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(props.playheadMs / 1000)}
      aria-valuetext={formatTimer(props.playheadMs)}
      onKeyDown={onKey}
    >
      <div className="timeline-ruler" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {formatTimer(t)}
          </span>
        ))}
      </div>
      <div
        ref={strip}
        className="timeline-strip"
        onPointerDown={onStripDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="timeline-zoomlane">
          {props.effectsHidden === true ? (
            <span className="zoomlane-hint" data-testid="effects-hidden">
              Zoom and effects show in After
            </span>
          ) : null}
          {moments.map((moment, index) => (
            <div
              key={`${String(moment.startMs)}-${String(index)}`}
              className={index === props.selectedMoment ? 'zoom-block selected' : 'zoom-block'}
              data-testid="zoom-block"
              style={{ left: pct(moment.startMs), width: pct(moment.endMs - moment.startMs) }}
              onPointerDown={(event) => {
                props.onSelectMoment(index);
                begin(event, { kind: 'move', index, lastMs: msAt(event.clientX) });
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <span
                className="zoom-edge start"
                aria-hidden="true"
                onPointerDown={(event) => {
                  props.onSelectMoment(index);
                  begin(event, { kind: 'edge', index, edge: 'start' });
                }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
              <span className="zoom-label">Zoom</span>
              <span
                className="zoom-edge end"
                aria-hidden="true"
                onPointerDown={(event) => {
                  props.onSelectMoment(index);
                  begin(event, { kind: 'edge', index, edge: 'end' });
                }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            </div>
          ))}
        </div>
        {props.texts === undefined || props.texts.length === 0 ? null : (
          <div className="timeline-textlane">
            {props.texts.map((item) => (
              <div
                key={item.id}
                className={item.id === props.selectedText ? 'text-marker selected' : 'text-marker'}
                data-testid="text-marker"
                title={item.text}
                style={{ left: pct(item.startMs), width: pct(item.endMs - item.startMs) }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  props.onSelectText?.(item.id);
                }}
              />
            ))}
          </div>
        )}
        <div className="timeline-track">
          {cuts.map((cut) => (
            <div
              key={`${String(cut.startMs)}-${String(cut.endMs)}`}
              className="cut-band"
              data-testid="cut-band"
              style={{ left: pct(cut.startMs), width: pct(cut.endMs - cut.startMs) }}
            />
          ))}
          {selection === null ? null : (
            <div
              className="selection-band"
              style={{
                left: pct(selection.startMs),
                width: pct(selection.endMs - selection.startMs),
              }}
            />
          )}
          {trimStart > 0 ? (
            <div className="trim-dim" style={{ left: 0, width: pct(trimStart) }} />
          ) : null}
          {trimEnd < durationMs ? (
            <div
              className="trim-dim"
              style={{ left: pct(trimEnd), width: pct(durationMs - trimEnd) }}
            />
          ) : null}
          <span
            className="trim-grip start"
            data-testid="trim-start"
            style={{ left: pct(trimStart) }}
            onPointerDown={(event) => {
              begin(event, { kind: 'trim', edge: 'start' });
            }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <span
            className="trim-grip end"
            data-testid="trim-end"
            style={{ left: pct(trimEnd) }}
            onPointerDown={(event) => {
              begin(event, { kind: 'trim', edge: 'end' });
            }}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
        <div className="playhead" style={{ left: pct(props.playheadMs) }} aria-hidden="true" />
      </div>
    </div>
  );
}
