import type { CloseChoice } from './close-policy';

/** What the page answers: that the question is on screen, or one of the three choices. */
export type CloseAnswer = 'shown' | CloseChoice;

/**
 * Asks the page to show the close question in the app's own dialog and waits for the answer. The page
 * says at once that the question is on screen. If it never does (the page is still loading or has
 * crashed) the answer is null, and the caller falls back to the system message box, so a close during a
 * recording is never left waiting on a dialog nobody can see.
 */
export function createCloseAsker(options: {
  /** Sends the question to the page. False when there is no page to send it to. */
  send: (trayAvailable: boolean) => boolean;
  timeoutMs?: number;
}) {
  const timeoutMs = options.timeoutMs ?? 1500;
  let pending:
    | { resolve: (choice: CloseChoice | null) => void; acked: boolean; timer: NodeJS.Timeout }
    | undefined;

  return {
    ask(trayAvailable: boolean): Promise<CloseChoice | null> {
      if (pending !== undefined) return Promise.resolve(null);
      if (!options.send(trayAvailable)) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending !== undefined && !pending.acked) {
            pending = undefined;
            resolve(null);
          }
        }, timeoutMs);
        pending = { resolve, acked: false, timer };
      });
    },
    /** The page's answer. One that arrives with no question open is ignored. */
    answer(answer: CloseAnswer): void {
      if (pending === undefined) return;
      if (answer === 'shown') {
        pending.acked = true;
        clearTimeout(pending.timer);
        return;
      }
      clearTimeout(pending.timer);
      const { resolve } = pending;
      pending = undefined;
      resolve(answer);
    },
  };
}
