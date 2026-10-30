import {
  Copy,
  Crop,
  EyeOff,
  GripHorizontal,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  Redo2,
  Save,
  Share2,
  Square,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button, ConfirmDialog, Segmented, Switch, Tooltip, useToast } from '../../ui';
import type { ShareSource } from '../../../shared/share-contract';
import { ShareDialog } from '../share/share-dialog';
import {
  EMPTY_DOC,
  addItem,
  boundsOf,
  fontSizeFor,
  hitTest,
  moveItem,
  nextId,
  outputSize,
  removeItem,
  replaceItem,
  setCrop,
  visibleRect,
  type ColorName,
  type Doc,
  type Item,
  type ThicknessName,
  type Tool,
} from './document';
import { drawDoc, drawOverlay } from './draw';
import {
  MIN_BOX,
  clampPoint,
  cropFromDrag,
  fitScale,
  handleAt,
  rectFromPoints,
  resizeRect,
  viewToImage,
  type Handle,
  type Point,
  type Size,
} from './geometry';
import {
  canRedo,
  canUndo,
  createHistory,
  isDirty,
  push,
  redo,
  undo,
  type History,
} from './history';

interface ToolSpec {
  tool: Tool;
  label: string;
  key: string;
  Icon: LucideIcon;
}

/** The tools, in toolbar order. Each has a single key. */
const TOOLS: readonly ToolSpec[] = [
  { tool: 'select', label: 'Select', key: 'V', Icon: MousePointer2 },
  { tool: 'crop', label: 'Crop', key: 'C', Icon: Crop },
  { tool: 'arrow', label: 'Arrow', key: 'A', Icon: MoveUpRight },
  { tool: 'box', label: 'Box', key: 'R', Icon: Square },
  { tool: 'highlight', label: 'Highlight', key: 'H', Icon: Highlighter },
  { tool: 'text', label: 'Text', key: 'T', Icon: Type },
  { tool: 'blur', label: 'Blur', key: 'B', Icon: EyeOff },
];

const COLOR_OPTIONS = [
  { value: 'green', label: 'Green', swatch: 'ui-swatch-green', hideLabel: true },
  { value: 'black', label: 'Black', swatch: 'ui-swatch-black', hideLabel: true },
  { value: 'white', label: 'White', swatch: 'ui-swatch-white', hideLabel: true },
  { value: 'red', label: 'Red', swatch: 'ui-swatch-red', hideLabel: true },
] as const;

const THICKNESS_OPTIONS = [
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'thick', label: 'Thick' },
] as const;

type Gesture =
  | { kind: 'draw'; start: Point }
  | { kind: 'crop'; start: Point }
  | { kind: 'move'; start: Point; original: Item }
  | { kind: 'resize'; handle: Handle; original: Item }
  | { kind: 'arrow-end'; end: 'from' | 'to'; original: Item };

export interface ScreenshotEditorProps {
  /** The screenshot being edited. It is never changed. */
  path: string;
  onClose: () => void;
  /** Called with the new file and its size after Done. */
  onSaved: (path: string, size: Size) => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('The image could not be loaded.'));
    };
    image.src = dataUrl;
  });
}

/** The editor for one screenshot: a toolbar, the picture on a canvas, and the actions. All of it stays on this computer. */
export function ScreenshotEditor({ path, onClose, onSaved }: ScreenshotEditorProps) {
  const toast = useToast();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [history, setHistory] = useState<History<Doc>>(() => createHistory(EMPTY_DOC));
  const [live, setLive] = useState<Doc | null>(null);
  const [draft, setDraft] = useState<Item | null>(null);
  const [cropDraft, setCropDraft] = useState<ReturnType<typeof rectFromPoints> | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<ColorName>('red');
  const [thickness, setThickness] = useState<ThicknessName>('medium');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copy, setCopy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [shareSource, setShareSource] = useState<ShareSource | null>(null);
  const [textEdit, setTextEdit] = useState<{ at: Point; value: string } | null>(null);
  const [available, setAvailable] = useState<Size>({ width: 800, height: 400 });

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragFile = useRef<string | null>(null);
  const dragVersion = useRef<Doc | null>(null);

  const doc = live ?? history.present;
  const imageSize = useMemo<Size>(
    () => ({ width: image?.naturalWidth ?? 1, height: image?.naturalHeight ?? 1 }),
    [image],
  );
  const view = visibleRect(doc, imageSize);
  const scale = fitScale(view, available);
  const selected = doc.items.find((item) => item.id === selectedId) ?? null;
  const dirty = isDirty(history);

  useEffect(() => {
    let alive = true;
    void window.scrim
      .invoke('image:read', { path })
      .then(loadImage)
      .then((loaded) => {
        if (alive) setImage(loaded);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = (): void => {
      setAvailable({
        width: Math.max(120, element.clientWidth),
        height: Math.max(120, element.clientHeight),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Draws the picture and then the editing marks, whenever anything that shows changes.
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !image) return;
    element.width = Math.max(1, Math.round(view.width * scale));
    element.height = Math.max(1, Math.round(view.height * scale));
    drawDoc(context, image, imageSize, doc, { scale, draft });
    drawOverlay(context, doc, imageSize, { scale, selected, cropDraft });
  }, [image, imageSize, doc, draft, scale, selected, cropDraft, view.width, view.height]);

  // The text box sits over the picture where the text will go, placed through the CSSOM.
  useEffect(() => {
    const input = textInput.current;
    if (!input || !textEdit) return;
    const left = (textEdit.at.x - view.x) * scale;
    const top = (textEdit.at.y - view.y) * scale;
    input.style.setProperty('left', `${String(left)}px`);
    input.style.setProperty('top', `${String(top)}px`);
    input.style.setProperty('font-size', `${String(fontSizeFor(thickness) * scale)}px`);
    // The press that placed the box would take focus back if it were focused in the same frame.
    const frame = requestAnimationFrame(() => {
      input.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [textEdit, view.x, view.y, scale, thickness]);

  const commit = useCallback((next: Doc) => {
    setHistory((current) => push(current, next));
  }, []);

  const finishText = useCallback(
    (save: boolean) => {
      if (!textEdit) return;
      const text = textEdit.value.trim();
      setTextEdit(null);
      if (!save || text === '') return;
      const item: Item = {
        id: nextId(history.present),
        kind: 'text',
        color,
        thickness,
        at: textEdit.at,
        text,
      };
      commit(addItem(history.present, item));
      setSelectedId(item.id);
    },
    [textEdit, history.present, color, thickness, commit],
  );

  const doUndo = useCallback(() => {
    setHistory((current) => undo(current));
    setSelectedId(null);
  }, []);
  const doRedo = useCallback(() => {
    setHistory((current) => redo(current));
    setSelectedId(null);
  }, []);
  const deleteSelected = useCallback(() => {
    if (selectedId === null) return;
    commit(removeItem(history.present, selectedId));
    setSelectedId(null);
  }, [selectedId, history.present, commit]);

  // One key per tool, and undo, redo and delete. Ignored while typing or while a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        doRedo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const spec = TOOLS.find((entry) => entry.key.toLowerCase() === key);
      if (spec) {
        event.preventDefault();
        setTool(spec.tool);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        deleteSelected();
      } else if (key === 'escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [doUndo, doRedo, deleteSelected]);

  const pointOf = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return viewToImage({ x: event.clientX - box.left, y: event.clientY - box.top }, view, scale);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 || !image) return;
    if (textEdit) finishText(true);
    const point = clampPoint(pointOf(event), view);
    const reach = 8 / scale;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'select') {
      if (selected) {
        if (selected.kind === 'arrow') {
          const end =
            Math.hypot(point.x - selected.from.x, point.y - selected.from.y) <= reach
              ? 'from'
              : Math.hypot(point.x - selected.to.x, point.y - selected.to.y) <= reach
                ? 'to'
                : null;
          if (end) {
            gesture.current = { kind: 'arrow-end', end, original: selected };
            return;
          }
        } else if (selected.kind !== 'text') {
          const handle = handleAt(selected.rect, point, reach);
          if (handle) {
            gesture.current = { kind: 'resize', handle, original: selected };
            return;
          }
        }
      }
      const hit = hitTest(doc, point, reach);
      setSelectedId(hit?.id ?? null);
      if (hit) gesture.current = { kind: 'move', start: point, original: hit };
      return;
    }

    setSelectedId(null);
    if (tool === 'text') {
      setTextEdit({ at: point, value: '' });
      return;
    }
    gesture.current =
      tool === 'crop' ? { kind: 'crop', start: point } : { kind: 'draw', start: point };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const active = gesture.current;
    if (!active) return;
    const point = clampPoint(pointOf(event), view);
    switch (active.kind) {
      case 'crop':
        setCropDraft(rectFromPoints(active.start, point));
        break;
      case 'draw': {
        const id = nextId(history.present);
        if (tool === 'arrow') {
          setDraft({ id, kind: 'arrow', color, thickness, from: active.start, to: point });
        } else if (tool === 'box' || tool === 'highlight' || tool === 'blur') {
          setDraft({ id, kind: tool, color, thickness, rect: rectFromPoints(active.start, point) });
        }
        break;
      }
      case 'move': {
        const moved = moveItem(
          active.original,
          point.x - active.start.x,
          point.y - active.start.y,
          view,
        );
        setLive(replaceItem(history.present, moved));
        break;
      }
      case 'resize': {
        const original = active.original;
        if (original.kind === 'arrow' || original.kind === 'text') break;
        const rect = resizeRect(original.rect, active.handle, point, view);
        setLive(replaceItem(history.present, { ...original, rect }));
        break;
      }
      case 'arrow-end': {
        const original = active.original;
        if (original.kind !== 'arrow') break;
        setLive(replaceItem(history.present, { ...original, [active.end]: point }));
        break;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>): void => {
    const active = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!active) return;
    const point = clampPoint(pointOf(event), view);
    if (active.kind === 'crop') {
      setCropDraft(null);
      const crop = cropFromDrag(active.start, point, view);
      if (crop) {
        commit(setCrop(history.present, crop));
        setTool('select');
      }
    } else if (active.kind === 'draw') {
      const made = draft;
      setDraft(null);
      if (!made) return;
      const size = boundsOf(made, 0);
      const big =
        made.kind === 'arrow'
          ? Math.hypot(size.width, size.height)
          : Math.min(size.width, size.height);
      if (big >= MIN_BOX) {
        commit(addItem(history.present, made));
        setSelectedId(made.id);
      }
    } else if (live) {
      commit(live);
      setLive(null);
    }
  };

  const render = useCallback((): string | null => {
    if (!image) return null;
    const size = outputSize(history.present, imageSize);
    const out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const context = out.getContext('2d');
    if (!context) return null;
    drawDoc(context, image, imageSize, history.present, { scale: 1 });
    return out.toDataURL('image/png');
  }, [image, imageSize, history.present]);

  const failed = (): void => {
    toast('Scrim could not do that. Try again.');
  };

  const onDone = (): void => {
    if (!dirty) {
      onClose();
      return;
    }
    const dataUrl = render();
    if (dataUrl === null) {
      failed();
      return;
    }
    setSaving(true);
    void window.scrim
      .invoke('image:save-edited', { sourcePath: path, dataUrl, copy })
      .then((result) => {
        toast(`Saved ${fileName(result.path)}${result.copied ? ' and copied it' : ''}`);
        onSaved(result.path, outputSize(history.present, imageSize));
      })
      .catch(failed)
      .finally(() => {
        setSaving(false);
      });
  };

  const onCopy = (): void => {
    const dataUrl = render();
    if (dataUrl === null) {
      failed();
      return;
    }
    void window.scrim
      .invoke('image:copy', { dataUrl })
      .then(() => {
        toast('Copied to the clipboard');
      })
      .catch(failed);
  };

  // What is shared is the final picture with every mark on it, not the file on disk.
  const onShare = (): void => {
    const dataUrl = render();
    if (dataUrl === null) {
      failed();
      return;
    }
    setShareSource({
      kind: 'edited',
      dataUrl,
      name: `${fileName(path).replace(/\.png$/i, '')}-edited`,
    });
  };

  const onSaveAs = (): void => {
    const dataUrl = render();
    if (dataUrl === null) {
      failed();
      return;
    }
    const base = fileName(path).replace(/\.png$/i, '');
    void window.scrim
      .invoke('image:save-as', { dataUrl, name: `${base}-edited.png` })
      .then((result) => {
        if (result.path !== null) toast(`Saved ${fileName(result.path)}`);
      })
      .catch(failed);
  };

  // A drag out needs a file. The edit is written when the pointer goes down on the handle, and the
  // drag, which starts a moment later, hands that file to the system.
  const prepareDrag = (): void => {
    if (dragVersion.current === history.present && dragFile.current !== null) return;
    const dataUrl = render();
    if (dataUrl === null) return;
    dragVersion.current = history.present;
    dragFile.current = null;
    void window.scrim
      .invoke('image:save-edited', { sourcePath: path, dataUrl, copy: false })
      .then((result) => {
        dragFile.current = result.path;
      })
      .catch(failed);
  };

  const cursor = tool === 'select' ? 'shot-canvas-select' : 'shot-canvas-draw';

  if (loadFailed) {
    return (
      <p className="ui-help" role="alert">
        Scrim could not open this screenshot. It may have been moved or deleted.
      </p>
    );
  }

  return (
    <div className="shot-editor">
      <div className="shot-toolbar" role="toolbar" aria-label="Editing tools">
        <div className="shot-tools">
          {TOOLS.map(({ tool: id, label, key, Icon }) => (
            <Tooltip key={id} label={label} keys={[key]}>
              <button
                type="button"
                className={id === tool ? 'icon-button shot-tool selected' : 'icon-button shot-tool'}
                aria-label={label}
                aria-pressed={id === tool}
                onClick={() => {
                  setTool(id);
                }}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </Tooltip>
          ))}
        </div>
        <Segmented
          label="Color"
          options={COLOR_OPTIONS}
          value={color}
          onChange={(value) => {
            setColor(value);
            if (selected && selected.kind !== 'blur') {
              commit(replaceItem(history.present, { ...selected, color: value }));
            }
          }}
        />
        <Segmented
          label="Thickness"
          options={THICKNESS_OPTIONS}
          value={thickness}
          onChange={(value) => {
            setThickness(value);
            if (selected) commit(replaceItem(history.present, { ...selected, thickness: value }));
          }}
        />
        <div className="shot-tools">
          <Tooltip label="Undo" keys={['Ctrl', 'Z']}>
            <button
              type="button"
              className="icon-button"
              aria-label="Undo"
              disabled={!canUndo(history)}
              onClick={doUndo}
            >
              <Undo2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Redo" keys={['Ctrl', 'Shift', 'Z']}>
            <button
              type="button"
              className="icon-button"
              aria-label="Redo"
              disabled={!canRedo(history)}
              onClick={doRedo}
            >
              <Redo2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Delete the selected mark" keys={['Del']}>
            <button
              type="button"
              className="icon-button"
              aria-label="Delete selected"
              disabled={selected === null}
              onClick={deleteSelected}
            >
              <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div ref={stage} className="shot-stage">
        {image ? (
          <div className="shot-canvas-wrap">
            <canvas
              ref={canvas}
              className={`shot-canvas ${cursor}`}
              aria-label="The screenshot. Choose a tool, then drag on the picture."
              role="img"
              onPointerDown={onPointerDown}
              onMouseDown={(event) => {
                // A text box is about to appear, and the click must not move focus away from it.
                if (tool === 'text') event.preventDefault();
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {textEdit ? (
              <input
                ref={textInput}
                className="shot-text-input"
                aria-label="Text to add"
                value={textEdit.value}
                onChange={(event) => {
                  setTextEdit({ ...textEdit, value: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') finishText(true);
                  if (event.key === 'Escape') finishText(false);
                }}
                onBlur={() => {
                  finishText(true);
                }}
              />
            ) : null}
          </div>
        ) : (
          <p className="ui-help">Opening the screenshot</p>
        )}
      </div>

      <p className="ui-help" role="status">
        {String(Math.round(view.width))} by {String(Math.round(view.height))}.{' '}
        {doc.items.length === 1 ? '1 mark' : `${String(doc.items.length)} marks`}
        {selected === null ? '' : `, ${selected.kind} selected`}.
      </p>

      <div className="shot-actions">
        <Switch label="Copy when done" checked={copy} onChange={setCopy} />
        <span className="shot-actions-gap" />
        <Tooltip label="Drag the edited image into another app">
          <button
            type="button"
            className="icon-button shot-drag"
            aria-label="Drag the edited image out"
            draggable
            onPointerDown={prepareDrag}
            onDragStart={(event) => {
              event.preventDefault();
              const file = dragFile.current;
              if (file !== null) void window.scrim.invoke('image:drag', { path: file });
            }}
          >
            <GripHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
        <Button icon={<Copy size={16} strokeWidth={1.75} />} onClick={onCopy}>
          Copy
        </Button>
        <Button icon={<Save size={16} strokeWidth={1.75} />} onClick={onSaveAs}>
          Save as
        </Button>
        <Button icon={<Share2 size={16} strokeWidth={1.75} />} onClick={onShare}>
          Share
        </Button>
        <Button
          onClick={() => {
            if (dirty) setConfirmCancel(true);
            else onClose();
          }}
        >
          Cancel
        </Button>
        <Button variant="primary" disabled={saving || !image} onClick={onDone}>
          Done
        </Button>
      </div>

      <ShareDialog
        source={shareSource}
        onClose={() => {
          setShareSource(null);
        }}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Discard your edits?"
        confirmLabel="Discard edits"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => {
          setConfirmCancel(false);
        }}
        onConfirm={() => {
          setConfirmCancel(false);
          onClose();
        }}
      >
        <p>The edits you made are lost. The original screenshot is not changed.</p>
      </ConfirmDialog>
    </div>
  );
}
