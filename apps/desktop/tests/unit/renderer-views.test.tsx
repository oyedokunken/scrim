import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ControlView } from '../../src/renderer/src/components/control-view';
import { RecordingView } from '../../src/renderer/src/components/recording-view';
import { RecordView } from '../../src/renderer/src/shell/record-view';
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

const review = {
  finished,
  job: null,
  onExport: noop,
  onCancelJob: noop,
  onRetryJob: noop,
  onRetrySafer: noop,
  onShowInFolder: noop,
  onRecordAgain: noop,
  onDiscarded: noop,
  onExported: noop,
  onProblem: noop,
};

describe('the Record view', () => {
  const render = (props: Partial<Parameters<typeof RecordView>[0]> = {}) =>
    renderToStaticMarkup(<RecordView busy={false} onStart={noop} {...props} />);

  it('starts with the one big button and no list of recent recordings', () => {
    const html = render();
    expect(html).toContain('Start recording');
    expect(html).not.toContain('Recent recordings');
  });

  it('shows the review screen in place of the start screen after a recording', () => {
    const html = render({ review });
    expect(html).toContain('Review your recording');
    expect(html).toContain('Before');
    expect(html).toContain('After');
    expect(html).toContain('Compare');
    expect(html).not.toContain('Start recording');
    expect(html).not.toContain('Recording saved');
  });

  it('says so when the recording was recovered after a crash', () => {
    expect(render({ review: { ...review, finished: { ...finished, recovered: true } } })).toContain(
      'Recording recovered',
    );
  });

  it('shows the controls under the start screen and never beside a review', () => {
    const controls = <p>camera and microphone</p>;
    const start = render({ controls });
    expect(start).toContain('class="record-controls"');
    expect(start).toContain('camera and microphone');
    expect(start.indexOf('record-controls')).toBeGreaterThan(start.indexOf('Start recording'));
    const reviewing = render({ review, controls });
    expect(reviewing).not.toContain('record-controls');
    expect(reviewing).not.toContain('camera and microphone');
  });

  it('does not print the folder path on screen', () => {
    expect(render({ review })).not.toContain('Recordings');
  });
});
