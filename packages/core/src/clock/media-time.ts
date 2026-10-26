import { err, ok, type Result } from '../result';

/**
 * One pause on the main clock, in milliseconds. `resumedAt` is null while the recording is still
 * paused, which can only be true of the last pause.
 */
export interface Pause {
  pausedAt: number;
  resumedAt: number | null;
}

export type PauseError =
  | { code: 'not-finite'; index: number }
  | { code: 'before-start'; index: number }
  | { code: 'resume-before-pause'; index: number }
  | { code: 'overlap'; index: number }
  | { code: 'open-pause-not-last'; index: number };

/**
 * Checks that pauses are finite, start after the recording, end after they begin, do not overlap
 * and are in order, and that only the last one is still open. Pass `startTime` to also reject a
 * pause that begins before the recording did.
 */
export function validatePauses(
  pauses: readonly Pause[],
  startTime?: number,
): Result<readonly Pause[], PauseError> {
  let previousEnd = startTime ?? Number.NEGATIVE_INFINITY;
  for (const [index, pause] of pauses.entries()) {
    if (
      !Number.isFinite(pause.pausedAt) ||
      (pause.resumedAt !== null && !Number.isFinite(pause.resumedAt))
    ) {
      return err({ code: 'not-finite', index });
    }
    if (startTime !== undefined && pause.pausedAt < startTime) {
      return err({ code: 'before-start', index });
    }
    if (pause.pausedAt < previousEnd) return err({ code: 'overlap', index });
    if (pause.resumedAt === null) {
      if (index !== pauses.length - 1) return err({ code: 'open-pause-not-last', index });
      continue;
    }
    if (pause.resumedAt < pause.pausedAt) return err({ code: 'resume-before-pause', index });
    previousEnd = pause.resumedAt;
  }
  return ok(pauses);
}

/**
 * Converts an instant on the main clock to media time: the time since the recording started,
 * minus every moment spent paused before it. An instant inside a pause maps to the moment the
 * pause began, because no frame exists for it. An instant before the start maps to zero.
 *
 * Pauses must be valid (see `validatePauses`). The result never decreases as `mainTime` grows.
 */
export function toMediaTime(mainTime: number, startTime: number, pauses: readonly Pause[]): number {
  let paused = 0;
  for (const pause of pauses) {
    if (mainTime <= pause.pausedAt) break;
    const end = pause.resumedAt ?? Number.POSITIVE_INFINITY;
    if (mainTime < end) {
      return Math.max(0, pause.pausedAt - startTime - paused);
    }
    paused += end - pause.pausedAt;
  }
  return Math.max(0, mainTime - startTime - paused);
}

/** Whether an instant on the main clock falls inside a pause. The resume instant is not paused. */
export function isPaused(mainTime: number, pauses: readonly Pause[]): boolean {
  return pauses.some(
    (pause) =>
      mainTime > pause.pausedAt && (pause.resumedAt === null || mainTime < pause.resumedAt),
  );
}
