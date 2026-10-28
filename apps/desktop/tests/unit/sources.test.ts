import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ desktopCapturer: { getSources: vi.fn() } }));

const { toSourceList, toWindowTiles } = await import('../../src/main/recording/sources');

const raw = (id: string, name: string, displayId = '') => ({
  id,
  name,
  display_id: displayId,
  thumbnailDataUrl: `data:image/png;base64,${id}`,
});

describe('toSourceList', () => {
  it('puts screens first, then windows sorted by name', () => {
    const list = toSourceList(
      [
        raw('window:3:0', 'Zoom'),
        raw('screen:1:0', 'Screen 2', '222'),
        raw('window:2:0', 'Notes'),
        raw('screen:0:0', 'Screen 1', '111'),
      ],
      new Set(),
    );
    expect(list.map((source) => source.id)).toEqual([
      'screen:1:0',
      'screen:0:0',
      'window:2:0',
      'window:3:0',
    ]);
    expect(list[0]).toMatchObject({ kind: 'display', displayId: '222' });
    expect(list[2]).toMatchObject({ kind: 'window', name: 'Notes' });
  });

  it('leaves out Scrim own windows and windows with no name', () => {
    const list = toSourceList(
      [raw('window:1:0', 'Scrim'), raw('window:2:0', '   '), raw('window:3:0', 'Browser')],
      new Set(['window:1:0']),
    );
    expect(list.map((source) => source.name)).toEqual(['Browser']);
  });

  it('leaves out anything that is neither a screen nor a window', () => {
    expect(toSourceList([raw('other:1', 'Odd')], new Set())).toEqual([]);
  });

  it('carries the thumbnail and the window icon, and leaves a missing display id out', () => {
    const list = toSourceList(
      [
        { ...raw('screen:0:0', 'Screen 1'), appIconDataUrl: undefined },
        { ...raw('window:5:0', 'Editor'), appIconDataUrl: 'data:image/png;base64,icon' },
      ],
      new Set(),
    );
    expect(list[0]?.displayId).toBeUndefined();
    expect(list[0]?.thumbnail).toContain('screen:0:0');
    expect(list[1]?.icon).toBe('data:image/png;base64,icon');
  });
});

describe('toWindowTiles', () => {
  const png = new Uint8Array([1, 2, 3]);
  const raw = (id: string, name: string, bytes = png) => ({ id, name, png: bytes });

  it('offers named windows with a picture, sorted by name, without Scrim own windows', () => {
    const tiles = toWindowTiles(
      [
        raw('window:3:0', 'Zoom'),
        raw('window:1:0', 'Scrim'),
        raw('window:2:0', 'Notes'),
        raw('window:4:0', '  '),
        raw('window:5:0', 'Blank', new Uint8Array()),
        raw('screen:0:0', 'Screen 1'),
      ],
      new Set(['window:1:0']),
    );
    expect(tiles.map((tile) => tile.name)).toEqual(['Notes', 'Zoom']);
    expect(tiles[0]?.png).toBe(png);
  });
});
