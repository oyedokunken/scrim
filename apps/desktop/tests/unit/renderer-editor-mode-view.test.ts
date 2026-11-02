import { describe, expect, it } from 'vitest';
import { timelineForMode } from '../../src/renderer/src/editor/mode-view';

const moments = [{ startMs: 1000, endMs: 3000, x: 10, y: 10 }];
const texts = [{ id: 'a' }];

describe('what the timeline shows per view', () => {
  it('before has no zoom moments and no text markers', () => {
    const shown = timelineForMode('before', moments, texts);
    expect(shown.moments).toEqual([]);
    expect(shown.texts).toEqual([]);
    expect(shown.effectsHidden).toBe(true);
  });

  it.each(['after', 'compare'] as const)('%s shows the moments and the texts', (mode) => {
    const shown = timelineForMode(mode, moments, texts);
    expect(shown.moments).toBe(moments);
    expect(shown.texts).toBe(texts);
    expect(shown.effectsHidden).toBe(false);
  });
});
