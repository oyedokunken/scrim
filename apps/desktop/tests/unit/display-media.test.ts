import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ desktopCapturer: { getSources: vi.fn() } }));

const { chooseSource } = await import('../../src/main/recording/display-media');

const sources = [
  { id: 'screen:0:0', name: 'Screen 1', display_id: '111' },
  { id: 'screen:1:0', name: 'Screen 2', display_id: '222' },
  { id: 'window:42:0', name: 'Notes', display_id: '' },
];

describe('chooseSource', () => {
  it('picks the display with the matching id', () => {
    expect(chooseSource(sources, { kind: 'display', displayId: '222' })?.id).toBe('screen:1:0');
  });

  it('falls back to the first screen with no id or an id that is gone', () => {
    expect(chooseSource(sources, { kind: 'display' })?.id).toBe('screen:0:0');
    expect(chooseSource(sources, { kind: 'display', displayId: '999' })?.id).toBe('screen:0:0');
  });

  it('never picks a window for a display', () => {
    expect(chooseSource(sources.slice(2), { kind: 'display' })).toBeUndefined();
  });

  it('picks a window only by its exact source id', () => {
    expect(chooseSource(sources, { kind: 'window', sourceId: 'window:42:0' })?.name).toBe('Notes');
    expect(chooseSource(sources, { kind: 'window', sourceId: 'window:43:0' })).toBeUndefined();
  });

  it('returns nothing when there are no sources', () => {
    const empty: { id: string; name: string; display_id: string }[] = [];
    expect(chooseSource(empty, { kind: 'display' })).toBeUndefined();
  });
});
