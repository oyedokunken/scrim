import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ControlView } from '../../src/renderer/src/components/control-view';
import { RecordingView } from '../../src/renderer/src/components/recording-view';
import { SavedCard } from '../../src/renderer/src/shell/saved-card';
import type { Finished, Snapshot } from '../../src/renderer/src/hooks';

const recording: Snapshot = {
  phase: 'recording',
  elapsedMs: 7400,
  bytesWritten: 100,
  tracks: [],
  warnings: [],
};
const noop = vi.fn();

const control = (snapshot: Snapshot, busy = false) =>
  renderToStaticMarkup(
    <ControlView snapshot={snapshot} busy={busy} onPause={noop} onResume={noop} onStop={noop} />,
  );

describe('the recording control', () => {
  it('is a labelled group with a red dot, the time, Pause and Stop', () => {
    const html = control(recording);
    expect(html).toContain('role="group" aria-label="Recording controls"');
    expect(html).toMatch(/<span class="rec-dot" aria-hidden="true">/);
    expect(html).toContain('>REC<');
    expect(html).toMatch(/role="timer"[^>]*>00:07</);
    expect(html).toContain('>Pause<');
    expect(html).toContain('>Stop<');
  });

  it('offers Resume while paused, and shows the dot as an outline', () => {
    const html = control({ ...recording, phase: 'paused' });
    expect(html).toContain('>Resume<');
    expect(html).not.toContain('>Pause<');
    expect(html).toContain('rec-dot paused');
    expect(html).toContain('>Paused<');
  });

  it('says it is saving and cannot be pressed while the recording is being finished', () => {
    const html = control({ ...recording, phase: 'stopping' });
    expect(html).toContain('>Saving<');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('cannot be pressed twice while a request is running', () => {
    expect(control(recording, true).match(/disabled=""/g)).toHaveLength(2);
    expect(control(recording, false)).not.toContain('disabled=""');
  });

  it('shows an hour as hours, minutes and seconds', () => {
    expect(control({ ...recording, elapsedMs: 3_725_000 })).toMatch(/>1:02:05</);
  });

  it('uses no inline style, which the packaged policy blocks', () => {
    expect(control(recording)).not.toMatch(/\sstyle=/);
  });
});

describe('the recording view in the main window', () => {
  const view = (snapshot: Snapshot) =>
    renderToStaticMarkup(
      <RecordingView
        snapshot={snapshot}
        busy={false}
        onPause={noop}
        onResume={noop}
        onStop={noop}
      />,
    );

  it('says a recording is running, with the time and a way to stop and save', () => {
    const html = view(recording);
    expect(html).toContain('Recording');
    expect(html).toContain('00:07');
    expect(html).toContain('>Stop and save<');
    expect(html).toContain('>Pause<');
  });

  it('shows pause and saving states in words', () => {
    expect(view({ ...recording, phase: 'paused' })).toContain('Recording is paused');
    expect(view({ ...recording, phase: 'stopping' })).toContain('Saving your recording');
  });

  it('shows a warning from the engine, such as a camera that stopped', () => {
    const html = view({
      ...recording,
      warnings: [
        { code: 'camera-lost', message: 'The camera stopped. Screen recording continues.' },
      ],
    });
    expect(html).toContain('The camera stopped. Screen recording continues.');
  });
});

const finished: Finished = {
  folder: 'C:\\Recordings\\take 1',
  name: 'take 1',
  files: [
    { kind: 'screen', path: 'C:\\Recordings\\take 1\\screen.webm' },
    { kind: 'mic', path: 'C:\\Recordings\\take 1\\mic.webm' },
  ],
  durationMs: 12_000,
  bytes: 4096,
  recovered: false,
  warnings: [],
};

describe('what opens after a recording', () => {
  const view = (result: Finished) =>
    renderToStaticMarkup(
      <SavedCard finished={result} onShowInFolder={noop} onRecordAgain={noop} />,
    );

  it('says it was saved, with its name, length and size', () => {
    const html = view(finished);
    expect(html).toContain('Recording saved');
    expect(html).toContain('take 1');
    expect(html).toContain('00:12');
    expect(html).toContain('4.0 KB');
  });

  it('says so when the recording was recovered after a crash', () => {
    expect(view({ ...finished, recovered: true })).toContain('Recording recovered');
  });

  it('never leaves a dead end: show it in the folder, or record again', () => {
    const html = view(finished);
    expect(html).toContain('>Show in folder<');
    expect(html).toContain('>Record again<');
  });

  it('passes on what the engine warned about', () => {
    expect(view({ ...finished, warnings: ['The camera stopped at 00:05.'] })).toContain(
      'The camera stopped at 00:05.',
    );
  });

  it('does not print the folder path on screen', () => {
    expect(view(finished)).not.toContain('C:\\Recordings');
  });
});

describe('the saved card', () => {
  it('has no logo and offers Open in editor only when there is an editor', () => {
    const without = renderToStaticMarkup(
      <SavedCard finished={finished} onShowInFolder={noop} onRecordAgain={noop} />,
    );
    expect(without).not.toContain('brand-mark');
    expect(without).not.toContain('Open in editor');
    const withEditor = renderToStaticMarkup(
      <SavedCard
        finished={finished}
        onOpenEditor={noop}
        onShowInFolder={noop}
        onRecordAgain={noop}
      />,
    );
    expect(withEditor).toContain('>Open in editor<');
  });
});
