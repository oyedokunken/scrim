import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { etaWords, progressWords } from '../../src/renderer/src/review/review-screen';
import { RerenderChoice } from '../../src/renderer/src/shell/rerender-choice';
import type { ExportJobView } from '../../src/renderer/src/hooks';

const job = (over: Partial<ExportJobView> = {}): ExportJobView => ({
  id: 'j1',
  phase: 'running',
  progress: { frame: 30, totalFrames: 100, fraction: 0.3, etaMs: 20_000, speed: 1 },
  result: null,
  error: null,
  safer: false,
  preview: false,
  recording: 'Take 1.scrim',
  ...over,
});

describe('the progress words', () => {
  it('give the percent and the time left', () => {
    expect(progressWords(job())).toBe('Making your video, 30%, about 20 seconds left');
  });

  it('switch to minutes for a long wait, and stay quiet before there is a speed', () => {
    expect(etaWords(300_000)).toBe(', about 5 minutes left');
    expect(etaWords(null)).toBe('');
    expect(progressWords(job({ progress: null }))).toBe('Making your video');
  });

  it('say that the video is waiting its turn when another render is ahead of it', () => {
    expect(progressWords(job({ phase: 'queued', progress: null }))).toBe(
      'Waiting to make your video',
    );
  });
});

describe('the Replace or Save as new question', () => {
  const noop = (): void => undefined;

  it('offers both choices and a way out, in plain words', () => {
    const html = renderToStaticMarkup(
      <RerenderChoice open name="Take 1" onReplace={noop} onSaveNew={noop} onKeep={noop} />,
    );
    expect(html).toContain('Replace the video');
    expect(html).toContain('Save as a new video');
    expect(html).toContain('Not now');
    expect(html).toContain('Take 1');
  });
});
