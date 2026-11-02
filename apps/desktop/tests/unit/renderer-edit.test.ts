import { describe, expect, it, vi } from 'vitest';
import { EDIT_SECTIONS, lookOf } from '../../src/renderer/src/edit/recording-edit-pane';
import { saveEditedRecording } from '../../src/renderer/src/edit/save-recording';
import {
  NO_SHOT_BACKGROUND,
  frameGeometry,
  hasBackground,
} from '../../src/renderer/src/screenshot/background';
import { DEFAULT_SETTINGS, lookSchema } from '../../src/shared/settings';

describe('the edit pane for a recording', () => {
  it('offers Background, Cursor and Zoom and nothing else', () => {
    expect(EDIT_SECTIONS.map((section) => section.label)).toEqual(['Background', 'Cursor', 'Zoom']);
  });
});

describe('saving an edited recording', () => {
  function bridge(job: unknown) {
    const invoke = vi.fn(() => Promise.resolve(job));
    (globalThis as { window?: unknown }).window = { scrim: { invoke } };
    return invoke;
  }

  it("replaces the video by writing over the file with the recording's name", async () => {
    const invoke = bridge({ id: 'job-7' });
    const started = await saveEditedRecording('D:/Projects/x.scrim', { zoomLevel: 2 }, 'replace');
    expect(started).toEqual({ ok: true, jobId: 'job-7' });
    expect(invoke).toHaveBeenCalledWith('export:start', {
      folder: 'D:/Projects/x.scrim',
      look: { zoomLevel: 2 },
      collision: 'replace',
    });
  });

  it('saves a new video with a numbered name so nothing is overwritten', async () => {
    const invoke = bridge({ id: 'job-8' });
    await saveEditedRecording('D:/Projects/x.scrim', { cursorStyle: 'off' }, 'new');
    expect(invoke).toHaveBeenCalledWith(
      'export:start',
      expect.objectContaining({ collision: 'number' }),
    );
  });

  it('says so in plain words when the recording is gone or the call fails', async () => {
    bridge(null);
    expect(await saveEditedRecording('D:/x', {}, 'new')).toMatchObject({ ok: false });
    (globalThis as { window?: unknown }).window = {
      scrim: { invoke: () => Promise.reject(new Error('x')) },
    };
    expect(await saveEditedRecording('D:/x', {}, 'new')).toMatchObject({ ok: false });
  });
});

describe('a screenshot on a background', () => {
  const size = { width: 1000, height: 600 };

  it('does not change a screenshot that has no background', () => {
    expect(hasBackground(NO_SHOT_BACKGROUND)).toBe(false);
    expect(frameGeometry(size, NO_SHOT_BACKGROUND)).toEqual({
      width: 1000,
      height: 600,
      pad: 0,
      radius: 0,
      shadow: null,
    });
  });

  it('grows the picture by the padding on every side, as a share of the shorter side', () => {
    const geometry = frameGeometry(size, { ...NO_SHOT_BACKGROUND, id: 'dots', padding: 'medium' });
    expect(geometry.pad).toBe(36);
    expect(geometry.width).toBe(1072);
    expect(geometry.height).toBe(672);
    expect(geometry.radius).toBe(15);
    expect(geometry.shadow).not.toBeNull();
  });

  it('has no padding, no rounding and no shadow room with padding None', () => {
    const geometry = frameGeometry(size, {
      id: 'dots',
      padding: 'none',
      corners: 'round',
      shadow: true,
    });
    expect(geometry.pad).toBe(0);
    expect(geometry.shadow).toBeNull();
    expect(geometry.width).toBe(1000);
  });

  it('uses the same shares as a recording, so one choice gives one look', () => {
    const big = frameGeometry(size, {
      id: 'dots',
      padding: 'large',
      corners: 'square',
      shadow: false,
    });
    expect(big.pad).toBe(60);
    expect(big.radius).toBe(0);
    expect(big.shadow).toBeNull();
  });
});

describe('the look an edit starts from', () => {
  it('is the saved look, with every part present', () => {
    expect(lookOf({ ...DEFAULT_SETTINGS, cursorStyle: 'ripples', zoomLevel: 2.4 })).toMatchObject({
      cursorStyle: 'ripples',
      zoomLevel: 2.4,
      backgroundId: DEFAULT_SETTINGS.backgroundId,
    });
    expect(Object.keys(lookOf(DEFAULT_SETTINGS)).sort()).toEqual(
      Object.keys(lookSchema.shape).sort(),
    );
  });
});
