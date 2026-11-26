import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor } from '../../src/main/export/look';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { runProcess } from '../../src/main/recording/ffmpeg';
import type { RunProcess } from '../../src/main/recording/ffmpeg';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { ExportRequest } from '../../src/main/export/types';
import { makeFixture, testFfmpeg } from './support/export-fixture';
import type { Fixture } from './support/export-fixture';

const tools = testFfmpeg();
const made: Fixture[] = [];
afterAll(() => {
  for (const fixture of made) rmSync(fixture.root, { recursive: true, force: true });
});

describe.skipIf(tools === undefined)('an encoder that dies in the middle of a render', () => {
  it('starts over with the next encoder instead of failing', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 1 });
    made.push(fixture);
    // The short probe says the VA-API encoder works, as a hardware encoder does on a quiet test
    // picture. The real render then fails, because this machine has no such device.
    const run: RunProcess = (command, args, options) =>
      args.includes('h264_vaapi')
        ? Promise.resolve({ code: 0, stdout: '', stderr: '' })
        : runProcess(command, args, options);
    const lines: string[] = [];
    const request: ExportRequest = {
      folder: fixture.folder,
      outputDir: join(fixture.root, 'out'),
      collision: 'number',
      settings: {
        preset: 'source',
        fps: 30,
        quality: 'medium',
        keepAudio: true,
        micGain: 1,
        shadow: true,
      },
      style: renderStyleFromSettings({ ...DEFAULT_SETTINGS }),
      paint: cursorPaintFor('brand'),
      avoidEncoders: ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox'],
    };
    const outcome = await exportRecording(
      { paths: tools, run, log: (line) => lines.push(line) },
      request,
    );
    expect(outcome.ok).toBe(true);
    expect(lines.some((line) => line.includes('h264_vaapi stopped mid render'))).toBe(true);
  }, 120_000);
});
