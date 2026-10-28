import { describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor, styleFromSettings } from '../../src/main/export/look';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { testFfmpeg } from './support/export-fixture';

// Manual check against a real recording: SCRIM_REAL_SESSION=<session folder> SCRIM_REAL_OUT=<folder>.
const folder = process.env['SCRIM_REAL_SESSION'];
const outputDir = process.env['SCRIM_REAL_OUT'];
const tools = testFfmpeg();

describe.skipIf(folder === undefined || outputDir === undefined || tools === undefined)(
  'real session',
  () => {
    it('exports', async () => {
      if (folder === undefined || outputDir === undefined || tools === undefined) return;
      const began = Date.now();
      const outcome = await exportRecording(
        {
          paths: tools,
          run: runProcess,
          log: (m) => {
            console.log(m);
          },
        },
        {
          folder,
          outputDir,
          collision: 'number',
          settings: {
            preset: 'source',
            fps: 30,
            quality: 'medium',
            keepAudio: true,
            micGain: 1,
            shadow: true,
          },
          style: styleFromSettings({ ...DEFAULT_SETTINGS, cameraOn: true, backgroundId: 'dots' }),
          paint: cursorPaintFor('brand'),
        },
        {
          onProgress: (p) => {
            if (p.frame % 120 === 0) console.log(`speed ${p.speed.toFixed(2)}x`);
          },
        },
      );
      console.log(JSON.stringify(outcome), `${String(Date.now() - began)} ms`);
      expect(outcome.ok).toBe(true);
    }, 600_000);
  },
);
