import { Pause, Play, Scissors } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createRenderModel, recordingDuration, sourceToOutput } from '@scrim/core/render';
import type { RenderModel } from '@scrim/core/render';
import { addMoment, cursorAt, deleteMoment, moveMoment, resizeMoment } from '@scrim/core/zoom';
import type { ZoomMoment } from '@scrim/core/zoom';
import { Button, Segmented, Tooltip } from '../../ui';
import { cursorPaintCss, renderStyleFromSettings } from '../../../shared/render-style';
import type { Settings } from '../../../shared/settings';
import { formatTimer } from '../format';
import { SPLIT_MAX, SPLIT_MIN, paintFrame, splitFromPointer, type CompareMode } from './draw-frame';
import type { EditorApi, EditorProject } from './editor-api';
import {
  addCut,
  commit,
  createHistory,
  editZoom,
  redo,
  resetZoom,
  setTrim,
  undo,
  type Edits,
  type History,
  type Span,
} from './edits';
import { Timeline } from './timeline';
import { usePlayback } from './use-playback';
import { ExportPanel } from './export-panel';
import { mediaSources } from './media-source';
import { ZoomMoments } from './zoom-moments';
import './editor.css';

const MODE_OPTIONS = [
  { value: 'before', label: 'Before' },
  { value: 'compare', label: 'Compare' },
  { value: 'after', label: 'After' },
] as const;

export interface EditorViewProps {
  folder: string;
  api: EditorApi;
  settings: Settings;
}

/** Opens a recording and shows the editor, or says why it could not. */
export function EditorView(props: EditorViewProps) {
  const { api, folder } = props;
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; project: EditorProject }
  >({ status: 'loading' });

  useEffect(() => {
    let live = true;
    void api.open(folder).then((result) => {
      if (!live) return;
      setState(
        result.ok
          ? { status: 'ready', project: result.project }
          : { status: 'error', message: result.message },
      );
    });
    return () => {
      live = false;
    };
  }, [api, folder]);

  if (state.status === 'loading') return <p className="editor-note">Opening the recording</p>;
  if (state.status === 'error') {
    return (
      <div className="editor-note" role="alert">
        <p>{state.message}</p>
        <p>Your recording was not changed.</p>
      </div>
    );
  }
  return <Editor {...props} project={state.project} />;
}

function Editor({ folder, api, settings, project }: EditorViewProps & { project: EditorProject }) {
  const screenEl = useRef<HTMLVideoElement>(null);
  const cameraEl = useRef<HTMLVideoElement>(null);
  const micEl = useRef<HTMLAudioElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const [history, setHistory] = useState<History>(() => createHistory(project.edits));
  const [draft, setDraftState] = useState<Edits | null>(null);
  const draftRef = useRef<Edits | null>(null);
  const setDraft = useCallback((next: Edits | null): void => {
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const [mode, setMode] = useState<CompareMode>('after');
  const [split, setSplit] = useState(0.5);
  const [selectedMoment, setSelectedMoment] = useState<number | null>(null);
  const [selection, setSelection] = useState<Span | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const edits = draft ?? history.present;

  const durationMs = useMemo(() => recordingDuration(project.session), [project.session]);
  const model: RenderModel = useMemo(
    () =>
      createRenderModel({
        session: project.session,
        log: project.log,
        edits: { trim: edits.trim, cuts: edits.cuts, zoom: edits.zoom },
        settings: {
          preset: 'source',
          fps: 30,
          keepAudio: settings.keepSound,
          style: renderStyleFromSettings(settings),
        },
      }),
    [project.session, project.log, edits, settings],
  );
  const paint = useMemo(() => cursorPaintCss(settings.haloColor), [settings.haloColor]);

  const micOffsetMs = project.session.tracks.find((t) => t.kind === 'mic')?.startedAt ?? 0;
  const media = mediaSources(project);
  const hasCamera = media.camera !== undefined;
  const modeRef = useRef(mode);
  const splitRef = useRef(split);
  useEffect(() => {
    modeRef.current = mode;
    splitRef.current = split;
  }, [mode, split]);

  const paintCanvas = useCallback(
    (outputMs: number) => {
      const canvas = canvasEl.current;
      const screen = screenEl.current;
      const ctx = canvas?.getContext('2d');
      if (canvas === null || screen === null || !ctx) return;
      const { output } = model.layout;
      const k = canvas.width / output.width;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const media = { screen, camera: hasCamera ? cameraEl.current : null };
      const frame = model.describeAt(outputMs);
      paintFrame(ctx, modeRef.current, splitRef.current, model, frame, media, paint);
    },
    [model, paint, hasCamera],
  );

  const playback = usePlayback(
    model,
    { screen: screenEl, camera: cameraEl, mic: micEl },
    paintCanvas,
    micOffsetMs,
  );
  const { seek, pause, outputMs } = playback;

  // Redraw whenever what is shown changes, and when the browser has a new frame after a seek.
  useEffect(() => {
    seek(Math.min(outputMs, model.totalMs));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new model or mode redraws
  }, [model, mode, split]);
  useEffect(() => {
    const screen = screenEl.current;
    if (screen === null) return undefined;
    const redraw = (): void => {
      paintCanvas(outputMs);
    };
    screen.addEventListener('seeked', redraw);
    screen.addEventListener('loadeddata', redraw);
    return () => {
      screen.removeEventListener('seeked', redraw);
      screen.removeEventListener('loadeddata', redraw);
    };
  }, [paintCanvas, outputMs]);

  // The edit list is saved beside the recording a moment after each finished change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void api.saveEdits(folder, history.present).then((result) => {
        setSaveNote(result.ok ? 'Saved' : result.message);
      });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [api, folder, history.present]);

  const recordingMs = model.describeAt(outputMs).recordingTimeMs;
  const moments: readonly ZoomMoment[] = model.zoomMoments;
  const clickTimes = useMemo(
    () =>
      (project.log?.events ?? []).flatMap((e) =>
        e.type === 'click' && e.button === 'left' ? [e.t] : [],
      ),
    [project.log],
  );

  const change = useCallback(
    (next: Edits): void => {
      setHistory((h) => commit(h, next));
      setDraft(null);
    },
    [setDraft],
  );
  const changeZoom = useCallback(
    (fn: (list: ZoomMoment[]) => ZoomMoment[]): void => {
      change(editZoom(history.present, model.zoomMoments, durationMs, fn));
    },
    [change, history.present, model.zoomMoments, durationMs],
  );
  const dragZoom = useCallback(
    (fn: (list: ZoomMoment[]) => ZoomMoment[]): void => {
      setDraft(editZoom(draftRef.current ?? history.present, model.zoomMoments, durationMs, fn));
    },
    [setDraft, history.present, model.zoomMoments, durationMs],
  );

  const seekRecording = useCallback(
    (ms: number): void => {
      const out = sourceToOutput(model.timeline, ms);
      if (out !== null) {
        seek(out);
        return;
      }
      const next = model.timeline.segments.find((s) => s.srcStart > ms);
      seek(next?.outStart ?? model.totalMs);
    },
    [model, seek],
  );

  const addZoom = (): void => {
    const events = [...(project.log?.events ?? [])].sort((a, b) => a.t - b.t);
    const focus = cursorAt(events, recordingMs, model.source);
    changeZoom((list) => {
      const result = addMoment(list, recordingMs, focus, 2000, durationMs);
      if (result.added) setSelectedMoment(result.index);
      return result.moments;
    });
  };

  const cutSelection = (): void => {
    if (selection === null) return;
    change(addCut(history.present, selection.startMs, selection.endMs, durationMs));
    setSelection(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      setHistory((h) => (event.shiftKey ? redo(h) : undo(h)));
    } else if (mod && event.key.toLowerCase() === 'y') {
      setHistory((h) => redo(h));
    } else if (event.key === ' ' && target.tagName !== 'BUTTON') {
      playback.toggle();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedMoment !== null) {
        changeZoom((list) => deleteMoment(list, selectedMoment));
        setSelectedMoment(null);
      } else {
        cutSelection();
      }
    } else {
      return;
    }
    event.preventDefault();
  };

  const onDividerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (box === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent): void => {
      setSplit(splitFromPointer(e.clientX, box.left, box.width));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const output = model.layout.output;
  const canvasWidth = Math.min(1280, output.width);
  const canvasHeight = Math.round((canvasWidth * output.height) / output.width);

  return (
    <div className="editor" role="group" aria-label="Editor" onKeyDown={onKeyDown}>
      <div className="editor-main">
        <div className="editor-modes">
          <Segmented label="View" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </div>
        <div className="editor-stage" data-testid="editor-stage">
          <canvas
            ref={canvasEl}
            className="editor-canvas"
            width={canvasWidth}
            height={canvasHeight}
            style={{ aspectRatio: `${String(output.width)} / ${String(output.height)}` }}
            aria-label="Preview of the finished video"
          />
          {mode === 'compare' ? (
            <div
              className="compare-divider"
              style={{ left: `${String(split * 100)}%` }}
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuenow={Math.round(split * 100)}
              aria-label="Move to compare the original and the result"
              onPointerDown={onDividerDown}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                event.stopPropagation();
                setSplit((value) =>
                  Math.min(
                    SPLIT_MAX,
                    Math.max(SPLIT_MIN, value + (event.key === 'ArrowLeft' ? -0.05 : 0.05)),
                  ),
                );
              }}
            />
          ) : null}
          <video ref={screenEl} src={media.screen} muted preload="auto" playsInline hidden />
          {media.camera === undefined ? null : (
            <video ref={cameraEl} src={media.camera} muted preload="auto" playsInline hidden />
          )}
          {media.mic === undefined || !settings.keepSound ? null : (
            <audio ref={micEl} src={media.mic} preload="auto" />
          )}
        </div>
        <div className="editor-transport">
          <Tooltip label={playback.playing ? 'Pause' : 'Play'} keys={['Space']}>
            <button
              type="button"
              className="play-button"
              aria-label={playback.playing ? 'Pause' : 'Play'}
              onClick={playback.toggle}
            >
              {playback.playing ? (
                <Pause size={20} aria-hidden="true" />
              ) : (
                <Play size={20} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
          <span className="editor-time" aria-live="off">
            {formatTimer(outputMs)} / {formatTimer(model.totalMs)}
          </span>
          {selection === null ? null : (
            <Button icon={<Scissors size={16} />} onClick={cutSelection}>
              Cut
            </Button>
          )}
          {edits.cuts.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                change({ ...history.present, cuts: [] });
              }}
            >
              Restore cuts
            </Button>
          ) : null}
          <span className="editor-save" role="status">
            {saveNote}
          </span>
        </div>
        <Timeline
          durationMs={durationMs}
          playheadMs={recordingMs}
          trim={edits.trim}
          cuts={edits.cuts}
          moments={moments}
          selectedMoment={selectedMoment}
          selection={selection}
          onSeek={(ms) => {
            pause();
            seekRecording(ms);
          }}
          onSelectMoment={setSelectedMoment}
          onMoveMoment={(index, delta) => {
            dragZoom((list) => moveMoment(list, index, delta, durationMs));
          }}
          onResizeMoment={(index, edge, time) => {
            dragZoom((list) => resizeMoment(list, index, edge, time, durationMs));
          }}
          onTrim={(start, end) => {
            setDraft(setTrim(draftRef.current ?? history.present, start, end, durationMs));
          }}
          onSelection={setSelection}
          onGestureEnd={() => {
            const finished = draftRef.current;
            if (finished !== null) change(finished);
          }}
        />
      </div>
      <aside className="editor-side">
        <ZoomMoments
          moments={moments}
          clickTimes={clickTimes}
          selected={selectedMoment}
          enabled={model.effectsOffReason === null && settings.zoomOn}
          offReason={
            model.effectsOffReason ??
            (settings.zoomOn ? null : 'Auto zoom is off. Turn it on in Zoom to see the moments.')
          }
          onSelect={(index) => {
            setSelectedMoment(index);
            const moment = moments[index];
            if (moment !== undefined) {
              pause();
              seekRecording(moment.startMs);
            }
          }}
          onDelete={(index) => {
            changeZoom((list) => deleteMoment(list, index));
            setSelectedMoment(null);
          }}
          onAdd={addZoom}
          onReset={() => {
            change(resetZoom(history.present));
            setSelectedMoment(null);
          }}
          edited={edits.zoom !== undefined}
        />
        {api.exporter === undefined ? null : (
          <ExportPanel
            controls={api.exporter}
            folder={folder}
            beforeStart={async () => {
              await api.saveEdits(folder, history.present);
            }}
          />
        )}
      </aside>
    </div>
  );
}
