import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  addCut,
  commit,
  createHistory,
  editZoom,
  redo,
  resetZoom,
  setTrim,
  tidyCuts,
  undo,
  type Edits,
} from '../../src/renderer/src/editor/edits';
import { ExportPanel } from '../../src/renderer/src/editor/export-panel';
import { Timeline, tickSeconds } from '../../src/renderer/src/editor/timeline';
import { ZoomMoments } from '../../src/renderer/src/editor/zoom-moments';
import { cursorPaintCss, renderStyleFromSettings } from '../../src/shared/render-style';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const none: Edits = { trim: null, cuts: [] };
const planned = [
  { startMs: 1000, endMs: 3000, x: 10, y: 10 },
  { startMs: 6000, endMs: 8000, x: 20, y: 20 },
];

describe('trim and cuts', () => {
  it('keeps a trim inside the recording and stores a full trim as none', () => {
    expect(setTrim(none, -50, 99_000, 10_000).trim).toBeNull();
    expect(setTrim(none, 1000, 9000, 10_000).trim).toEqual({ startMs: 1000, endMs: 9000 });
    expect(setTrim(none, 9900, 9950, 10_000).trim?.endMs).toBe(10_000);
    const tiny = setTrim(none, 4000, 4100, 10_000).trim;
    expect((tiny?.endMs ?? 0) - (tiny?.startMs ?? 0)).toBeGreaterThanOrEqual(500);
  });

  it('adds cuts in any drag direction and joins the ones that touch', () => {
    let edits = addCut(none, 5000, 3000, 10_000);
    expect(edits.cuts).toEqual([{ startMs: 3000, endMs: 5000 }]);
    edits = addCut(edits, 4500, 7000, 10_000);
    expect(edits.cuts).toEqual([{ startMs: 3000, endMs: 7000 }]);
    edits = addCut(edits, 8000, 8050, 10_000);
    expect(edits.cuts).toHaveLength(1);
  });

  it('tidies sloppy cuts', () => {
    expect(
      tidyCuts(
        [
          { startMs: 8000, endMs: 99_000 },
          { startMs: 100, endMs: 2000 },
        ],
        10_000,
      ),
    ).toEqual([
      { startMs: 100, endMs: 2000 },
      { startMs: 8000, endMs: 10_000 },
    ]);
  });
});

describe('zoom edits', () => {
  it('start from the planned moments, so deleting one keeps the others', () => {
    const edited = editZoom(none, planned, 10_000, (list) => list.slice(1));
    expect(edited.zoom?.moments).toEqual([planned[1]]);
  });

  it('can be reset to the planner', () => {
    const edited = editZoom(none, planned, 10_000, () => []);
    expect(edited.zoom?.moments).toEqual([]);
    expect(resetZoom(edited).zoom).toBeUndefined();
  });
});

describe('history', () => {
  it('undoes and redoes, ignores a change that changes nothing, and drops the future on a new edit', () => {
    let h = createHistory(none);
    h = commit(h, none);
    expect(h.past).toHaveLength(0);
    h = commit(h, addCut(none, 1000, 2000, 10_000));
    h = commit(h, setTrim(h.present, 500, 9000, 10_000));
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(h.present.trim).toBeNull();
    h = redo(h);
    expect(h.present.trim).not.toBeNull();
    h = undo(undo(h));
    expect(h.present).toEqual(none);
    expect(undo(h)).toBe(h);
    h = commit(h, addCut(none, 100, 900, 10_000));
    expect(h.future).toHaveLength(0);
    expect(redo(h)).toBe(h);
  });
});

describe('timeline and moments markup', () => {
  const noop = (): void => undefined;
  it('draws a block per zoom, a band per cut and both trim grips', () => {
    const html = renderToStaticMarkup(
      <Timeline
        durationMs={10_000}
        playheadMs={2500}
        trim={{ startMs: 500, endMs: 9000 }}
        cuts={[{ startMs: 4000, endMs: 5000 }]}
        moments={planned}
        selectedMoment={0}
        selection={null}
        onSeek={noop}
        onSelectMoment={noop}
        onMoveMoment={noop}
        onResizeMoment={noop}
        onTrim={noop}
        onSelection={noop}
        onGestureEnd={noop}
      />,
    );
    expect(html.match(/data-testid="zoom-block"/g)).toHaveLength(2);
    expect(html).toContain('zoom-block selected');
    expect(html.match(/data-testid="cut-band"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="trim-start"');
    expect(html).toContain('data-testid="trim-end"');
    expect(html).toContain('aria-valuetext="00:02"');
  });

  it('picks ruler steps that give a handful of labels', () => {
    expect(tickSeconds(8000)).toBe(1);
    expect(tickSeconds(60_000)).toBe(10);
    expect(tickSeconds(3_600_000)).toBe(600);
  });

  it('lists the moments with their time and what they came from, and a delete for each', () => {
    const html = renderToStaticMarkup(
      <ZoomMoments
        moments={planned}
        clickTimes={[1500]}
        selected={null}
        enabled
        offReason={null}
        onSelect={noop}
        onDelete={noop}
        onAdd={noop}
        onReset={noop}
        edited
      />,
    );
    expect(html).toContain('00:01');
    expect(html).toContain('Click');
    expect(html).toContain('Added');
    expect(html).toContain('Delete the zoom at 00:06');
    expect(html).toContain('Add zoom here');
    expect(html).toContain('Reset zooms');
  });

  it('says why there is nothing to list when effects are off', () => {
    const html = renderToStaticMarkup(
      <ZoomMoments
        moments={[]}
        clickTimes={[]}
        selected={null}
        enabled={false}
        offReason="The mouse could not be logged."
        onSelect={noop}
        onDelete={noop}
        onAdd={noop}
        onReset={noop}
        edited={false}
      />,
    );
    expect(html).toContain('The mouse could not be logged.');
    expect(html).not.toContain('Reset zooms');
  });
});

describe('render style from settings', () => {
  it('carries the zoom choices and the look the person picked', () => {
    const style = renderStyleFromSettings({
      ...DEFAULT_SETTINGS,
      zoomLevel: 2.4,
      holdAfterClickMs: 2000,
    });
    expect(style.zoom).toMatchObject({ enabled: true, maxZoom: 2.4, holdMs: 2000 });
    expect(style.cursor?.style).toBe('halo-ripples');
    expect(
      renderStyleFromSettings({ ...DEFAULT_SETTINGS, backgroundId: 'none' }).background,
    ).toEqual({
      spec: { kind: 'none' },
    });
  });

  it('has a paint for every halo colour', () => {
    for (const color of ['brand', 'green', 'white', 'black'] as const) {
      expect(cursorPaintCss(color).haloRing).toMatch(/^rgba\(/);
    }
  });
});

describe('export panel', () => {
  const controls = {
    start: () => Promise.resolve({ ok: true as const, jobId: '1' }),
    cancel: noopFn,
    retrySafer: noopFn,
    reveal: noopFn,
    subscribe: () => noopFn,
  };

  it('shows the export button before any job and formats progress', () => {
    const html = renderToStaticMarkup(
      <ExportPanel controls={controls} folder="C:/x" beforeStart={() => Promise.resolve()} />,
    );
    expect(html).toContain('Export MP4');
    expect(html).not.toContain('<progress');
  });
});

function noopFn(): void {
  return undefined;
}
