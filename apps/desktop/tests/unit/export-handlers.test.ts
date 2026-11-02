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

const FOLDER = join('C:', 'Projects', 'Take 1.scrim');

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
    retry: vi.fn(() => job()),
    rerender: vi.fn(() => Promise.resolve(job())),
    pending: vi.fn(() => Promise.resolve([{ folder: FOLDER, name: 'Take 1' }])),
    resumePending: vi.fn(() => job()),
    dismissPending: vi.fn(),
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
    // The finished file's folder is shown on purpose. The working folder is not.
    expect(text).not.toContain('Projects');
    expect(view.result?.savedIn).toBe(join('Videos', 'Scrim'));
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

describe('the Replace, retry and unfinished render calls', () => {
  it('render again with the choice that was made, only for a folder Scrim made', async () => {
    const { handlers, exporter } = setup();
    expect(await handlers['export:rerender']({ folder: FOLDER, mode: 'new' })).toMatchObject({
      id: 'job-1',
    });
    expect(exporter.rerender).toHaveBeenCalledWith(FOLDER, 'new');
    const strict = setup(false);
    expect(
      await strict.handlers['export:rerender']({ folder: 'C:\\x', mode: 'replace' }),
    ).toBeNull();
    expect(strict.exporter.rerender).not.toHaveBeenCalled();
  });

  it('retry the same render, or say there is nothing to retry', () => {
    const { handlers, exporter } = setup();
    expect(handlers['export:retry']({ jobId: 'job-1' })).toMatchObject({ id: 'job-1' });
    vi.mocked(exporter.retry).mockReturnValueOnce(undefined);
    expect(handlers['export:retry']({ jobId: 'gone' })).toBeNull();
  });

  it('list, finish and dismiss the renders Scrim did not live to finish', async () => {
    const { handlers, exporter } = setup();
    expect(await handlers['export:pending'](undefined)).toEqual([
      { folder: FOLDER, name: 'Take 1' },
    ]);
    expect(handlers['export:resume-pending']({ folder: FOLDER })).toMatchObject({ id: 'job-1' });
    expect(exporter.resumePending).toHaveBeenCalledWith(FOLDER);
    void handlers['export:dismiss-pending']({ folder: FOLDER });
    expect(exporter.dismissPending).toHaveBeenCalledWith(FOLDER);
    const strict = setup(false);
    expect(strict.handlers['export:resume-pending']({ folder: 'C:\\x' })).toBeNull();
    expect(strict.exporter.resumePending).not.toHaveBeenCalled();
  });

  it('tell the page where the finished video went', () => {
    const view = toBridgeJob(
      job({
        phase: 'done',
        result: {
          ok: true,
          path: join('Videos', 'Scrim', 'Take 1.mp4'),
          durationMs: 1,
          bytes: 1,
          encoder: 'x',
          elapsedMs: 1,
          note: null,
          fellBack: false,
        },
      }),
    );
    expect(view.result?.savedIn).toBe(join('Videos', 'Scrim'));
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
