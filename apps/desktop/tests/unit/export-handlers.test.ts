import { describe, expect, it, vi } from 'vitest';
import {
  createExportHandlers,
  toBridgeJob,
  type ExportLike,
} from '../../src/main/export/export-handlers';
import type { ExportJob } from '../../src/main/export/service';
import { exportContract, exportJobSchema } from '../../src/shared/export-contract';
import { events } from '../../src/shared/ipc-contract';

import { join } from 'node:path';

const FOLDER = 'C:\\Projects\\Take 1.scrim';

const job = (over: Partial<ExportJob> = {}): ExportJob => ({
  id: 'job-1',
  folder: FOLDER,
  phase: 'queued',
  progress: null,
  result: null,
  error: null,
  safer: false,
  preview: false,
  ...over,
});

function setup(known = true) {
  const exporter: ExportLike = {
    start: vi.fn(() => job()),
    cancel: vi.fn(),
    retrySafer: vi.fn(() => job({ safer: true })),
    latest: vi.fn(() => undefined),
    reveal: vi.fn(() => Promise.resolve(true)),
  };
  const handlers = createExportHandlers({ exporter, isKnownFolder: () => known });
  return { exporter, handlers };
}

describe('toBridgeJob', () => {
  it('drops the folder and keeps only the name of the finished file', () => {
    const view = toBridgeJob(
      job({
        phase: 'done',
        result: {
          ok: true,
          path: join('Videos', 'Scrim', 'Take 1.mp4'),
          durationMs: 5000,
          bytes: 99,
          encoder: 'h264_mf',
          elapsedMs: 1000,
          note: null,
          fellBack: false,
        },
      }),
    );
    expect(view.result?.fileName).toBe('Take 1.mp4');
    const text = JSON.stringify(view);
    expect(text).not.toContain('Projects');
    expect(text).not.toContain('Videos');
    expect(exportJobSchema.safeParse(view).success).toBe(true);
    expect(events['export:status'].safeParse(view).success).toBe(true);
  });

  it('keeps the progress inside zero and one, and carries a failure in words', () => {
    const view = toBridgeJob(
      job({
        phase: 'failed',
        progress: { frame: 1, totalFrames: 2, fraction: 1.4, etaMs: null, speed: 1 },
        error: {
          code: 'folder-unwritable',
          message: 'Blocked.',
          nextStep: 'Allow Scrim.',
          stderrTail: 'tail',
        },
      }),
    );
    expect(view.progress?.fraction).toBe(1);
    expect(view.error).toEqual({
      code: 'folder-unwritable',
      message: 'Blocked.',
      nextStep: 'Allow Scrim.',
      stderrTail: 'tail',
    });
  });
});

describe('the export handlers', () => {
  it('start a render for a known folder, with only the choices that were made', () => {
    const { handlers, exporter } = setup();
    const result = handlers['export:start']({
      folder: FOLDER,
      collision: 'replace',
      settings: { preset: '1080p', fps: undefined },
    });
    expect(result).toMatchObject({ id: 'job-1', phase: 'queued' });
    expect(exporter.start).toHaveBeenCalledWith({
      folder: FOLDER,
      collision: 'replace',
      settings: { preset: '1080p' },
    });
  });

  it('refuse a folder Scrim did not make, without starting anything', () => {
    const { handlers, exporter } = setup(false);
    expect(handlers['export:start']({ folder: 'C:\\Windows' })).toBeNull();
    expect(exporter.start).not.toHaveBeenCalled();
  });

  it('cancel, retry with safer settings, report the latest and reveal', async () => {
    const { handlers, exporter } = setup();
    void handlers['export:cancel']({ jobId: 'job-1' });
    expect(exporter.cancel).toHaveBeenCalledWith('job-1');
    expect(handlers['export:retry-safer']({ jobId: 'job-1' })).toMatchObject({ safer: true });
    vi.mocked(exporter.retrySafer).mockReturnValueOnce(undefined);
    expect(handlers['export:retry-safer']({ jobId: 'gone' })).toBeNull();
    expect(handlers['export:latest'](undefined)).toBeNull();
    expect(await handlers['export:reveal']({ jobId: 'job-1', what: 'output' })).toBe(true);
    expect(exporter.reveal).toHaveBeenCalledWith('job-1', 'output');
  });
});

describe('the export contract', () => {
  const { input } = exportContract['export:start'];

  it('takes a folder and a few choices, and nothing else', () => {
    expect(input.safeParse({ folder: FOLDER }).success).toBe(true);
    expect(
      input.safeParse({ folder: FOLDER, settings: { preset: '720p', fps: 60, micGain: 2 } })
        .success,
    ).toBe(true);
    expect(input.safeParse({ folder: FOLDER, outputDir: 'C:\\x' }).success).toBe(false);
    expect(input.safeParse({ folder: FOLDER, settings: { preset: '8k' } }).success).toBe(false);
    expect(input.safeParse({ folder: FOLDER, settings: { micGain: 9 } }).success).toBe(false);
    expect(input.safeParse({ folder: FOLDER, fileName: '' }).success).toBe(false);
  });
});
