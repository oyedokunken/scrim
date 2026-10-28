import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CursorPanel, type CursorValue } from '../../src/renderer/src/panels/cursor-panel';
import { CursorPreview } from '../../src/renderer/src/panels/cursor-preview';
import { holdOf, motionOf, strengthOf } from '../../src/renderer/src/panels/presets';
import { ZoomPanel, type ZoomValue } from '../../src/renderer/src/panels/zoom-panel';
import { ZoomPreview } from '../../src/renderer/src/panels/zoom-preview';
import { DEFAULT_SETTINGS, settingsSchema } from '../../src/shared/settings';

const cursor: CursorValue = { style: 'halo-ripples', haloColor: 'brand' };
const zoom: ZoomValue = { on: true, level: 1.8, holdMs: 1200, smoothness: 0.6 };

describe('presets', () => {
  it('map saved numbers to the nearest choice', () => {
    expect(strengthOf(1.8)).toBe('medium');
    expect(strengthOf(3)).toBe('strong');
    expect(strengthOf(1.2)).toBe('subtle');
    expect(holdOf(1100)).toBe('medium');
    expect(holdOf(5000)).toBe('long');
    expect(motionOf(0.1)).toBe('snappy');
    expect(motionOf(0.95)).toBe('gentle');
  });

  it('stay inside what the settings accept', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, haloColor: 'white' }).success).toBe(
      true,
    );
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, haloColor: 'red' }).success).toBe(false);
  });
});

describe('the Cursor page', () => {
  it('has four style tiles and four halo colors, with the current ones selected', () => {
    const html = renderToStaticMarkup(<CursorPanel value={cursor} onChange={vi.fn()} />);
    for (const label of ['Halo and ripples', 'Halo only', 'Ripples only', 'Off']) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const color of ['Brand', 'Green', 'White', 'Black']) {
      expect(html).toContain(color);
    }
    expect(html).not.toContain('type="range"');
  });

  it('shows the chosen style and color in the preview, with no inline styles', () => {
    const html = renderToStaticMarkup(
      <CursorPreview value={{ style: 'ripples', haloColor: 'black' }} />,
    );
    expect(html).toContain('data-style="ripples"');
    expect(html).toContain('data-halo="black"');
    expect(html).not.toContain(' style=');
  });
});

describe('the Zoom page', () => {
  it('has the switch, three strength cards, hold and motion, and no sliders', () => {
    const html = renderToStaticMarkup(<ZoomPanel value={zoom} onChange={vi.fn()} />);
    for (const text of [
      'Auto zoom',
      'Subtle 1.4x',
      'Medium 1.8x',
      'Strong 2.4x',
      'Short',
      'Long',
      'Snappy',
      'Gentle',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('type="range"');
  });

  it('disables the other controls while auto zoom is off', () => {
    const html = renderToStaticMarkup(
      <ZoomPanel value={{ ...zoom, on: false }} onChange={vi.fn()} />,
    );
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it('shows the chosen timing in the preview', () => {
    const html = renderToStaticMarkup(
      <ZoomPreview value={{ on: true, level: 2.4, holdMs: 2000, smoothness: 0.3 }} />,
    );
    expect(html).toContain('data-strength="strong"');
    expect(html).toContain('data-hold="long"');
    expect(html).toContain('data-motion="snappy"');
    expect(html).not.toContain(' style=');
  });
});
