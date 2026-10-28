import type { RecordingService } from './recording-service';

export interface CrashGuardDeps {
  service: Pick<RecordingService, 'snapshot' | 'stop'>;
  log: (message: string) => void;
  /** Tells the person in plain words. The real one shows a dialog. */
  notify: (title: string, message: string) => void;
}

/** One line for the log, with no stack and no paths, which can hold a name. */
function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message.split('\n')[0] ?? ''}`;
  return typeof reason === 'string' ? (reason.split('\n')[0] ?? '') : 'unknown error';
}

/**
 * What to do when something nobody expected goes wrong in the main process. If a recording is
 * running, it is stopped and saved first, because the footage matters more than the cause. The
 * person is told in plain words, and the app carries on. A promise that was rejected without a
 * handler is logged and nothing else: it is usually a late failure of something already over.
 */
export function createCrashGuard(deps: CrashGuardDeps): {
  onException(error: unknown): Promise<void>;
  onRejection(reason: unknown): void;
} {
  let handling = false;
  return {
    async onException(error) {
      deps.log(`Unexpected error: ${describe(error)}`);
      if (handling) return;
      handling = true;
      try {
        const phase = deps.service.snapshot().phase;
        const recording = phase === 'recording' || phase === 'paused';
        if (recording) {
          const saved = await deps.service.stop();
          deps.notify(
            'Scrim ran into a problem',
            saved.ok
              ? 'Your recording was stopped and saved. You can find it in your recording folder.'
              : 'Your recording was kept on disk but could not be finished. Open Scrim again to recover it.',
          );
        } else {
          deps.notify(
            'Scrim ran into a problem',
            'Something went wrong. You can keep using Scrim.',
          );
        }
      } catch (stopError) {
        deps.log(`The recording could not be saved after an error: ${describe(stopError)}`);
        deps.notify(
          'Scrim ran into a problem',
          'Your recording was kept on disk. Open Scrim again to recover it.',
        );
      } finally {
        handling = false;
      }
    },
    onRejection(reason) {
      deps.log(`Unhandled promise rejection: ${describe(reason)}`);
    },
  };
}
