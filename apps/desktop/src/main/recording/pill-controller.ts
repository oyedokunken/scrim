import type { PillAction, PillPhase, PillState } from '../../recorder/pill/protocol';
import type { FinishedRecording, Outcome, RecordingEvent, RecordingSnapshot } from './types';

/** The part of the recording service the pill talks to. The real service fits it as it is. */
interface PillService {
  pause: () => Promise<Outcome<void>>;
  resume: () => Promise<Outcome<void>>;
  stop: () => Promise<Outcome<FinishedRecording>>;
  snapshot: () => RecordingSnapshot;
}

/** The window half of the pill. Opening and closing are safe to repeat. */
export interface PillWindow {
  open: () => void;
  close: () => void;
  send: (state: PillState) => void;
}

export interface PillControllerDeps {
  service: PillService;
  window: PillWindow;
  /** Moves a session folder to the recycle bin. Only ever called after the person confirmed. */
  trash: (folder: string) => Promise<void>;
  log: (message: string) => void;
}

/** What the pill shows for an engine phase, or nothing when no recording is live. */
export function pillPhaseOf(phase: RecordingSnapshot['phase']): PillPhase | undefined {
  if (phase === 'starting' || phase === 'recording') return 'recording';
  if (phase === 'paused') return 'paused';
  if (phase === 'stopping') return 'saving';
  return undefined;
}

/**
 * Connects the engine to the pill. Pause, resume and stop go straight to the recording service
 * here in main, so they work whatever the app window is doing. The pill opens when a recording is
 * live and closes when it ends for any reason, including a failure and a stop from a shortcut.
 */
export function createPillController(deps: PillControllerDeps) {
  const { service, window, log } = deps;
  let busy = false;

  const push = (): void => {
    const snapshot = service.snapshot();
    const phase = pillPhaseOf(snapshot.phase);
    if (phase === undefined) {
      window.close();
      return;
    }
    window.open();
    window.send({ phase, elapsedMs: snapshot.elapsedMs, busy: busy || phase === 'saving' });
  };

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    push();
    try {
      await work();
    } catch (error) {
      log(`The pill action failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      busy = false;
      push();
    }
  };

  const stopAndClose = async (): Promise<FinishedRecording | undefined> => {
    const result = await service.stop();
    // Whatever the engine said, nothing is recording now, so the pill goes.
    window.close();
    if (!result.ok) {
      log(`Stop from the pill did not finish cleanly: ${result.error.code}`);
      return undefined;
    }
    return result.value;
  };

  return {
    onEvent(event: RecordingEvent): void {
      if (event.type === 'state') push();
      else if (event.type === 'finished' || event.type === 'error') window.close();
    },
    /** Shows the pill for the recording in progress, if there is one. */
    open(): void {
      push();
    },
    close(): void {
      window.close();
    },
    async handle(action: PillAction): Promise<void> {
      switch (action.type) {
        case 'ready':
          push();
          return;
        case 'pause':
          await run(async () => {
            const result = await service.pause();
            if (!result.ok) log(`Pause did not work: ${result.error.code}`);
          });
          return;
        case 'resume':
          await run(async () => {
            const result = await service.resume();
            if (!result.ok) log(`Resume did not work: ${result.error.code}`);
          });
          return;
        case 'stop':
          await run(async () => {
            await stopAndClose();
          });
          return;
        case 'discard':
          await run(async () => {
            // The recording is stopped and saved first. Only then is the folder moved to the
            // recycle bin, so a failure at any point leaves a recording on disk, not nothing.
            const finished = await stopAndClose();
            if (finished === undefined) return;
            await deps.trash(finished.folder);
            log('A recording was discarded after the person confirmed.');
          });
          return;
      }
    },
  };
}
