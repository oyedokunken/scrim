import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { layoutText, TEXT_LIMITS, type TextItem } from '@scrim/core/render';
import { resetZoom, type Edits } from '../../src/renderer/src/editor/edits';
import { drawTexts, layoutOn } from '../../src/renderer/src/editor/draw-text';
import { Timeline } from '../../src/renderer/src/editor/timeline';
import { fractionsFor, pictureRect } from '../../src/renderer/src/editor/text-handle';
import { TextPanel } from '../../src/renderer/src/editor/text-panel';
import {
  addText,
  deleteText,
  freshTextId,
  textsOf,
  updateText,
} from '../../src/renderer/src/editor/text-edits';

const none: Edits = { trim: null, cuts: [] };
const DURATION = 10_000;

const item = (over: Partial<TextItem> = {}): TextItem => ({
  id: 'text-1',
  text: 'Hello',
  startMs: 1000,
  endMs: 4000,
  x: 0.5,
  y: 0.5,
  size: 'medium',
  color: 'white',
  chip: true,
  ...over,
});

describe('text edits', () => {
  it('adds a text at the playhead, inside the recording', () => {
    const { edits, id } = addText(none, 'text-1', 9_900, DURATION);
    expect(id).toBe('text-1');
    const added = textsOf(edits)[0];
    expect(added?.endMs).toBeLessThanOrEqual(DURATION);
    expect(added?.startMs).toBeLessThan(added?.endMs ?? 0);
  });

  it('gives each new text its own id and keeps them sorted by start', () => {
    let edits = addText(none, freshTextId(none), 5000, DURATION).edits;
    edits = addText(edits, freshTextId(edits), 1000, DURATION).edits;
    expect(textsOf(edits).map((t) => t.id)).toEqual(['text-2', 'text-1']);
    expect(freshTextId(edits)).toBe('text-3');
  });

  it('changes one item and clamps the result', () => {
    const base = addText(none, 'text-1', 1000, DURATION).edits;
    const moved = updateText(base, 'text-1', { x: 4, y: -2, endMs: 99_999 }, DURATION);
    expect(textsOf(moved)[0]).toMatchObject({ x: 1, y: 0, endMs: DURATION });
  });

  it('keeps the old words when the field is cleared or holds only markup', () => {
    const base = addText(none, 'text-1', 1000, DURATION).edits;
    expect(textsOf(updateText(base, 'text-1', { text: '' }, DURATION))[0]?.text).toBe('Your text');
    expect(textsOf(updateText(base, 'text-1', { text: '<>' }, DURATION))[0]?.text).toBe(
      'Your text',
    );
    expect(textsOf(updateText(base, 'text-1', { text: '<b>Hi</b>' }, DURATION))[0]?.text).toBe(
      'b Hi /b',
    );
  });

  it('deletes an item and drops the list when it is empty, so older readers see no texts', () => {
    const base = addText(none, 'text-1', 1000, DURATION).edits;
    const gone = deleteText(base, 'text-1');
    expect(gone.texts).toBeUndefined();
    expect('texts' in gone).toBe(false);
  });

  it('survives a zoom reset', () => {
    const base = addText(none, 'text-1', 1000, DURATION).edits;
    expect(resetZoom({ ...base, zoom: { moments: [] } }).texts).toEqual(base.texts);
  });
});

/** A context that measures every character as half the font size and records the draws. */
function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  let font = '';
  const ctx = {
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    fontKerning: 'auto',
    measureText: (text: string) => ({
      width: text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) * 0.5,
    }),
    save: () => calls.push({ name: 'save', args: [] }),
    restore: () => calls.push({ name: 'restore', args: [] }),
    beginPath: () => calls.push({ name: 'beginPath', args: [] }),
    roundRect: (...args: unknown[]) => calls.push({ name: 'roundRect', args }),
    fill: () => calls.push({ name: 'fill', args: [] }),
    fillText: (...args: unknown[]) => calls.push({ name: 'fillText', args }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, state: ctx };
}

describe('the preview draws text where the export does', () => {
  const output = { width: 1280, height: 720 };

  it('draws the chip and the words at the shared layout', () => {
    const { ctx, calls } = recordingContext();
    const t = item();
    drawTexts(ctx, [t], output);
    const layout = layoutOn(ctx, t, output);
    const chip = calls.find((c) => c.name === 'roundRect');
    expect(chip?.args).toEqual([
      layout.box.x,
      layout.box.y,
      layout.box.width,
      layout.box.height,
      layout.chipRadius,
    ]);
    expect(calls.find((c) => c.name === 'fillText')?.args).toEqual([
      'Hello',
      layout.textX,
      layout.baselineY,
    ]);
  });

  it('draws no chip when it is off, and nothing for no text', () => {
    const { ctx, calls } = recordingContext();
    drawTexts(ctx, [item({ chip: false })], output);
    expect(calls.some((c) => c.name === 'roundRect')).toBe(false);
    const empty = recordingContext();
    drawTexts(empty.ctx, [], output);
    expect(empty.calls).toHaveLength(0);
  });

  it('uses the bold Urbanist font and no kerning', () => {
    const { ctx, state } = recordingContext();
    drawTexts(ctx, [item()], output);
    expect(state.font).toContain('700');
    expect(state.font).toContain('Urbanist');
    expect(state.fontKerning).toBe('none');
  });

  it('uses the same layout function as the export', () => {
    const { ctx } = recordingContext();
    const t = item({ x: 0.1, y: 0.95, size: 'large' });
    const preview = layoutOn(ctx, t, output);
    const shared = layoutText(t, (px) => t.text.length * px * 0.5, output);
    expect(preview).toEqual(shared);
  });
});

describe('the drag handle maths', () => {
  it('finds the picture inside a letterboxed canvas box', () => {
    const picture = pictureRect(
      { left: 10, top: 20, width: 1000, height: 300 },
      { width: 1280, height: 720 },
    );
    expect(picture.height).toBeCloseTo(300);
    expect(picture.width).toBeCloseTo((300 * 1280) / 720);
    expect(picture.left).toBeCloseTo(10 + (1000 - picture.width) / 2);
    expect(picture.top).toBe(20);
  });

  it('turns a pointer offset into frame fractions and keeps them inside the frame', () => {
    expect(fractionsFor(250, 100, { width: 500, height: 200 })).toEqual({ x: 0.5, y: 0.5 });
    expect(fractionsFor(-40, 900, { width: 500, height: 200 })).toEqual({ x: 0, y: 1 });
    expect(fractionsFor(5, 5, { width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('text panel and timeline markers', () => {
  const noop = (): void => undefined;
  const panel = (selectedId: string | null, visibleInView = true) =>
    renderToStaticMarkup(
      <TextPanel
        texts={[item(), item({ id: 'text-2', text: 'Second', startMs: 6000, endMs: 8000 })]}
        selectedId={selectedId}
        playheadMs={2000}
        visibleInView={visibleInView}
        onSelect={noop}
        onAdd={noop}
        onChange={noop}
        onDelete={noop}
      />,
    );

  it('lists the texts, each with a named delete button', () => {
    const html = panel(null);
    expect(html).toContain('Delete the text Hello');
    expect(html).toContain('Delete the text Second');
    expect(html).toContain('Add text here');
    expect(html).not.toContain('data-testid="text-editor"');
  });

  it('shows the editor for the selected text with named controls', () => {
    const html = panel('text-1');
    expect(html).toContain('data-testid="text-editor"');
    expect(html).toContain('Words on screen');
    expect(html).toContain('Start at playhead');
    expect(html).toContain('End at playhead');
    expect(html).toContain('Text size');
    expect(html).toContain('Text color');
    expect(html).toContain('Background behind the text');
    expect(html).toContain(`maxLength="${String(TEXT_LIMITS.maxLength)}"`);
  });

  it('says where text shows when the view is Before', () => {
    expect(panel(null, false)).toContain('Text shows in After');
    expect(panel(null, true)).not.toContain('Text shows in After');
  });

  it('marks the texts on the timeline, and says effects are hidden in Before', () => {
    const base = {
      durationMs: DURATION,
      playheadMs: 0,
      trim: null,
      cuts: [],
      moments: [],
      selectedMoment: null,
      selection: null,
      onSeek: noop,
      onSelectMoment: noop,
      onMoveMoment: noop,
      onResizeMoment: noop,
      onTrim: noop,
      onSelection: noop,
      onGestureEnd: noop,
    };
    const after = renderToStaticMarkup(
      <Timeline {...base} texts={[item(), item({ id: 'b' })]} selectedText="b" />,
    );
    expect(after.match(/data-testid="text-marker"/g)).toHaveLength(2);
    expect(after).toContain('text-marker selected');
    expect(after).not.toContain('effects-hidden');
    const before = renderToStaticMarkup(<Timeline {...base} texts={[]} effectsHidden />);
    expect(before).not.toContain('text-marker');
    expect(before).toContain('effects-hidden');
  });
});
