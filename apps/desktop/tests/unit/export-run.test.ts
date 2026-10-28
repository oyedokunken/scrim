import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor } from '../../src/main/export/look';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { ExportRequest } from '../../src/main/export/types';
import { makeFixture, testFfmpeg } from './support/export-fixture';
import type { Fixture } from './support/export-fixture';

const tools = testFfmpeg();
const made: Fixture[] = [];
afterAll(() => {
  for (const fixture of made) rmSync(fixture.root, { recursive: true, force: true });
});

function requestFor(fixture: Fixture, overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    folder: fixture.folder,
    outputDir: fixture.outputDir,
    collision: 'number',
    settings: {
      preset: 'source',
      fps: 30,
      quality: 'medium',
      keepAudio: true,
      micGain: 1,
      shadow: true,
    },
    style: renderStyleFromSettings({ ...DEFAULT_SETTINGS, cameraOn: true }),
    paint: cursorPaintFor('brand'),
    ...overrides,
  };
}

function probe(path: string): {
  streams: {
    codec_type: string;
    codec_name: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
  }[];
  format: { duration: string };
} {
  if (tools === undefined) throw new Error('no tools');
  return JSON.parse(
    execFileSync(tools.ffprobe, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      path,
    ]).toString(),
  ) as ReturnType<typeof probe>;
}

describe.skipIf(tools === undefined)('exportRecording', () => {
  it('writes exactly one MP4 with one video and one audio stream, and no partial file', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { camera: true, mic: true, screenStartMs: 2500 });
    made.push(fixture);
    const outcome = await exportRecording(
      {
        paths: tools,
        run: runProcess,
        log: (m) => {
          console.log(m);
        },
      },
      requestFor(fixture),
    );
    if (!outcome.ok) console.log(JSON.stringify(outcome));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(readdirSync(fixture.outputDir)).toEqual(['Test.mp4']);
    const info = probe(outcome.path);
    const video = info.streams.filter((stream) => stream.codec_type === 'video');
    const audio = info.streams.filter((stream) => stream.codec_type === 'audio');
    expect(video).toHaveLength(1);
    expect(audio).toHaveLength(1);
    expect(video[0]?.codec_name).toBe('h264');
    expect(video[0]?.pix_fmt).toBe('yuv420p');
    expect(audio[0]?.codec_name).toBe('aac');
    expect(video[0]?.width).toBe(1280);
    expect(Number(info.format.duration)).toBeGreaterThan(3.8);
    expect(Number(info.format.duration)).toBeLessThan(4.2);
    // The working folder was only read.
    expect(readdirSync(fixture.folder)).not.toContain('Test.mp4');
  }, 45_000);

  it('leaves the folder untouched and reports a clear error when the source is gone', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, {});
    made.push(fixture);
    rmSync(fixture.folder, { recursive: true, force: true });
    const outcome = await exportRecording(
      { paths: tools, run: runProcess, log: () => undefined },
      requestFor(fixture),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('source-missing');
  });

  it('numbers the file when the name is taken and replaces only when told to', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 2 });
    made.push(fixture);
    const deps = { paths: tools, run: runProcess, log: () => undefined };
    const first = await exportRecording(deps, requestFor(fixture));
    const second = await exportRecording(deps, requestFor(fixture));
    const refused = await exportRecording(deps, requestFor(fixture, { collision: 'fail' }));
    const replaced = await exportRecording(deps, requestFor(fixture, { collision: 'replace' }));
    expect(first.ok && second.ok && replaced.ok).toBe(true);
    expect(refused.ok).toBe(false);
    expect(readdirSync(fixture.outputDir).sort()).toEqual(['Test 2.mp4', 'Test.mp4']);
  }, 45_000);

  it('stops on cancel and leaves no file behind', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 6 });
    made.push(fixture);
    const controller = new AbortController();
    const outcome = await exportRecording(
      { paths: tools, run: runProcess, log: () => undefined },
      requestFor(fixture),
      {
        signal: controller.signal,
        onProgress: () => {
          controller.abort();
        },
      },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('cancelled');
    expect(readdirSync(fixture.outputDir)).toEqual([]);
  }, 45_000);

  it('uses the edited zoom moments instead of the planner, and no zoom for an empty list', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 4 });
    made.push(fixture);
    const deps = { paths: tools, run: runProcess, log: () => undefined };
    const noBackground = {
      ...requestFor(fixture, { collision: 'replace' }),
      style: {
        zoom: { enabled: true, maxZoom: 2 },
        background: { spec: { kind: 'none' as const } },
      },
    };
    const frameHash = (path: string): string =>
      execFileSync(
        tools.ffmpeg,
        ['-v', 'error', '-ss', '1.6', '-i', path, '-frames:v', '1', '-f', 'md5', '-'],
        { encoding: 'utf8' },
      );
    const edit = (zoom: unknown): void => {
      writeFileSync(
        join(fixture.folder, 'edits.json'),
        JSON.stringify({
          version: 1,
          trim: null,
          cuts: [],
          ...(zoom === undefined ? {} : { zoom }),
        }),
      );
    };
    const run = async (name: string): Promise<string> => {
      const outcome = await exportRecording(deps, { ...noBackground, fileName: name });
      if (!outcome.ok) throw new Error(outcome.error.message);
      return frameHash(outcome.path);
    };
    edit(undefined);
    const planned = await run('planned');
    edit({ moments: [] });
    const none = await run('none');
    edit({ moments: [{ startMs: 1200, endMs: 3000, x: 200, y: 150 }] });
    const added = await run('added');
    expect(none).not.toBe(planned);
    expect(added).not.toBe(none);
    expect(added).not.toBe(planned);
  }, 180_000);
});
