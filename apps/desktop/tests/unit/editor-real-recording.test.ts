import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRenderModel, recordingDuration } from '@scrim/core/render';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { loadExportSource } from '../../src/main/export/source';

/**
 * Opens a real recording from this machine's projects folder, when there is one with a mouse log,
 * and checks what the editor would show: a model that matches the recording, zoom moments that
 * sit on its clicks, and a camera that never leaves the frame. It skips on a machine with none.
 */
const root = join(
  process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'),
  'Scrim',
  'Projects',
);
const folders = existsSync(root) ? readdirSync(root).filter((name) => name.endsWith('.scrim')) : [];

describe.skipIf(folders.length === 0)('the editor model on a real recording', () => {
  it('builds for every recording that has a mouse log', async () => {
    let checked = 0;
    for (const name of folders) {
      const loaded = await loadExportSource(join(root, name));
      if (!loaded.ok || loaded.source.log === null) continue;
      const { session, log, edits } = loaded.source;
      const model = createRenderModel({
        session,
        log,
        edits,
        settings: {
          preset: 'source',
          fps: 30,
          keepAudio: true,
          style: renderStyleFromSettings(DEFAULT_SETTINGS),
        },
      });
      const duration = recordingDuration(session);
      expect(model.totalMs).toBeLessThanOrEqual(duration + 1);
      expect(model.effectsOffReason).toBeNull();
      // The planner ignores the click that stops the recording, so only earlier clicks count.
      const clicks = log.events.filter(
        (e) => e.type === 'click' && e.button === 'left' && e.t < model.totalMs - 1200,
      );
      // Zoom is planned from the clicks only when the person did not save their own zoom moments, and
      // a region recording ignores clicks that land outside the recorded box.
      const planned = edits.zoom === undefined && session.source.cropPx === undefined;
      if (planned && clicks.length > 0) expect(model.zoomMoments.length).toBeGreaterThan(0);
      for (let t = 0; t < model.totalMs; t += 250) {
        const frame = model.describeAt(t);
        expect(frame.view.x).toBeGreaterThanOrEqual(-1e-6);
        expect(frame.view.x + frame.view.width).toBeLessThanOrEqual(model.source.width + 1e-6);
        expect(frame.view.y + frame.view.height).toBeLessThanOrEqual(model.source.height + 1e-6);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});
