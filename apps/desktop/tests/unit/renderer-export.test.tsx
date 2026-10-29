import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toExportView } from '../../src/renderer/src/shell/editor-bridge';
import { SavedCard } from '../../src/renderer/src/shell/saved-card';
import type { ExportJobView, Finished } from '../../src/renderer/src/hooks';

const finished: Finished = {
  folder: 'C:\\Projects\\take 1.scrim',
  name: 'take 1',
  files: [],
  durationMs: 12_000,
  bytes: 4096,
  recovered: false,
  warnings: [],
};

const job = (over: Partial<ExportJobView>): ExportJobView => ({
  id: 'j1',
  phase: 'queued',
  progress: null,
  result: null,
  error: null,
  safer: false,
  ...over,
});

const card = (value: ExportJobView | null) =>
  renderToStaticMarkup(
    <SavedCard
      finished={finished}
      job={value}
      onShowInFolder={vi.fn()}
      onRecordAgain={vi.fn()}
      onCancelExport={vi.fn()}
      onRetrySafer={vi.fn()}
      onReveal={vi.fn()}
      onExportAgain={vi.fn()}
    />,
  );

describe('the saved card while the video is made', () => {
  it('shows progress and a Cancel button while it runs', () => {
    const html = card(
      job({
        phase: 'running',
        progress: { frame: 5, totalFrames: 10, fraction: 0.42, etaMs: 20_000, speed: 1 },
      }),
    );
    expect(html).toContain('Making your video, 42%');
    expect(html).toContain('about 20 seconds left');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('>Cancel<');
  });

  it('says it is waiting when queued, with no percent', () => {
    const html = card(job({ phase: 'queued' }));
    expect(html).toContain('Waiting to make your video');
    expect(html).not.toContain('aria-valuenow');
  });

  it('names the saved file and offers Show in folder when done', () => {
    const html = card(
      job({
        phase: 'done',
        result: { fileName: 'take 1.mp4', durationMs: 1, bytes: 1, encoder: 'x', note: null },
      }),
    );
    expect(html).toContain('Video saved as take 1.mp4.');
    expect(html).toContain('>Show in folder<');
    expect(html).not.toContain('>Cancel<');
  });

  it('explains a failure, with a retry and the folder, as an alert', () => {
    const html = card(
      job({
        phase: 'failed',
        error: {
          code: 'folder-unwritable',
          message: 'Windows blocked the folder.',
          nextStep: 'Allow Scrim.',
        },
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Windows blocked the folder.');
    expect(html).toContain('Allow Scrim.');
    expect(html).toContain('>Retry with safer settings<');
    expect(html).toContain('>Open folder<');
  });

  it('offers to make the video again after a cancel', () => {
    const html = card(job({ phase: 'cancelled' }));
    expect(html).toContain('Your recording is safe.');
    expect(html).toContain('>Make the video<');
  });

  it('keeps working with no job at all', () => {
    const html = card(null);
    expect(html).toContain('>Show in folder<');
    expect(html).not.toContain('progressbar');
  });
});

describe('toExportView', () => {
  it('turns a job into what the editor export panel draws', () => {
    expect(
      toExportView(
        job({
          phase: 'failed',
          progress: { frame: 1, totalFrames: 2, fraction: 0.5, etaMs: 1000, speed: 1 },
          error: { code: 'x', message: 'Bad.', nextStep: 'Retry.', stderrTail: 'tail' },
        }),
      ),
    ).toEqual({
      id: 'j1',
      phase: 'failed',
      fraction: 0.5,
      etaMs: 1000,
      message: 'Bad. Retry.',
      detail: 'tail',
    });
    expect(
      toExportView(
        job({
          phase: 'done',
          result: { fileName: 'a.mp4', durationMs: 1, bytes: 1, encoder: 'x', note: null },
        }),
      ),
    ).toMatchObject({ fileName: 'a.mp4', fraction: null });
  });
});
