/**
 * What the app shell needs from the recorder. The window, the tray and the quit path talk to
 * this interface only, so the recording engine can be swapped in without touching the shell.
 */
export interface RecorderControl {
  isRecording(): boolean;
  start(): Promise<void>;
  /** Stops, flushes every writer and writes the clean close marker. Resolves when it is safe to quit. */
  stopAndSave(): Promise<void>;
  /** Called with the new state whenever recording starts or stops. Returns an unsubscribe function. */
  onChange(listener: (recording: boolean) => void): () => void;
}

export interface StubRecorder extends RecorderControl {
  setRecording(recording: boolean): void;
  readonly calls: { start: number; stop: number };
}

/** A recorder that only tracks state, for tests and until the engine is wired in. */
export function createStubRecorder(): StubRecorder {
  let recording = false;
  const listeners = new Set<(recording: boolean) => void>();
  const calls = { start: 0, stop: 0 };
  const set = (value: boolean): void => {
    if (recording === value) return;
    recording = value;
    for (const listener of listeners) listener(value);
  };
  return {
    calls,
    isRecording: () => recording,
    start() {
      calls.start += 1;
      set(true);
      return Promise.resolve();
    },
    stopAndSave() {
      calls.stop += 1;
      set(false);
      return Promise.resolve();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setRecording: set,
  };
}
