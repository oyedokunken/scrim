import type {
  RecordingEvent,
  RecordingOptions,
  RecordingSnapshot,
  Outcome,
} from '../recording/types';
import type { FinishedRecording } from '../recording/types';
import type { RecorderControl } from './recorder-control';

/** What the shell needs from the recording service. The real service fits it as it is. */
export interface ControllableService {
  on: (listener: (event: RecordingEvent) => void) => () => void;
  snapshot: () => RecordingSnapshot;
  start: (options: RecordingOptions) => Promise<Outcome<{ folder: string }>>;
  stop: () => Promise<Outcome<FinishedRecording>>;
}

export function isLivePhase(phase: RecordingSnapshot['phase']): boolean {
  return (
    phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'stopping'
  );
}

export interface RecordingControl extends RecorderControl {
  /** Hands over the service once it exists. The control reports not recording until then. */
  attach: (service: ControllableService) => void;
}

/**
 * The shell's view of the recording service: is something being recorded, start one from the tray,
 * and stop and save before the app quits. The service is created after the app is ready, and the
 * shell is created before it, so the service arrives through `attach`.
 */
export function createRecordingControl(options: {
  /** What a recording started from the tray records: the saved choices of the person. */
  startOptions: () => RecordingOptions;
}): RecordingControl {
  let service: ControllableService | undefined;
  let live = false;
  const listeners = new Set<(recording: boolean) => void>();

  const update = (next: boolean): void => {
    if (next === live) return;
    live = next;
    for (const listener of listeners) listener(next);
  };

  return {
    attach(attached) {
      service = attached;
      update(isLivePhase(attached.snapshot().phase));
      attached.on((event) => {
        if (event.type === 'state') update(isLivePhase(event.snapshot.phase));
        if (event.type === 'finished' || event.type === 'error') {
          update(isLivePhase(attached.snapshot().phase));
        }
      });
    },
    isRecording: () => live,
    async start() {
      if (service === undefined) throw new Error('The recording service is not ready.');
      const result = await service.start(options.startOptions());
      if (!result.ok) throw new Error(result.error.code);
    },
    async stopAndSave() {
      if (service === undefined) return;
      await service.stop();
      update(isLivePhase(service.snapshot().phase));
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
