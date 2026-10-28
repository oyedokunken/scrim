import { describe, expect, it, vi } from 'vitest';
import { createStubRecorder } from '../../src/main/shell/recorder-control';

describe('the stub recorder', () => {
  it('tracks start and stop', async () => {
    const recorder = createStubRecorder();
    expect(recorder.isRecording()).toBe(false);
    await recorder.start();
    expect(recorder.isRecording()).toBe(true);
    await recorder.stopAndSave();
    expect(recorder.isRecording()).toBe(false);
    expect(recorder.calls).toEqual({ start: 1, stop: 1 });
  });

  it('tells listeners only when the state changes', async () => {
    const recorder = createStubRecorder();
    const listener = vi.fn();
    const off = recorder.onChange(listener);
    recorder.setRecording(true);
    recorder.setRecording(true);
    await recorder.stopAndSave();
    expect(listener.mock.calls).toEqual([[true], [false]]);
    off();
    recorder.setRecording(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
