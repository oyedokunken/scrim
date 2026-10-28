import type { RecorderPhase } from '@scrim/core';
import type { RecordingEvent } from '../recording/types';
import { isLivePhase } from './recording-control';

export type WindowAction = 'hide-main' | 'show-control' | 'close-control' | 'show-main';

/**
 * What the windows do when the recording moves from one phase to another. Recording starts: the
 * main window gets out of the way and the small control appears. Recording ends, for any reason:
 * the control goes and the main window comes back, where the result or the error is shown.
 */
export function windowActions(previous: RecorderPhase, next: RecorderPhase): WindowAction[] {
  const wasLive = isLivePhase(previous);
  const isLive = isLivePhase(next);
  if (!wasLive && isLive) return ['hide-main', 'show-control'];
  if (wasLive && !isLive) return ['close-control', 'show-main'];
  return [];
}

export interface WindowEffects {
  hideMain: () => void;
  showControl: () => void;
  closeControl: () => void;
  showMain: () => void;
}

/**
 * Feeds engine events to the window effects. The engine says when the phase changes, when a
 * recording finishes and when it fails, and each of those leaves the screen in the right state even
 * if an earlier event was missed, because the effects are safe to repeat.
 */
export function createRecordingWindows(effects: WindowEffects) {
  let previous: RecorderPhase = 'idle';

  const run = (actions: WindowAction[]): void => {
    for (const action of actions) {
      if (action === 'hide-main') effects.hideMain();
      else if (action === 'show-control') effects.showControl();
      else if (action === 'close-control') effects.closeControl();
      else effects.showMain();
    }
  };

  return {
    onEvent(event: RecordingEvent): void {
      if (event.type === 'state') {
        const next = event.snapshot.phase;
        run(windowActions(previous, next));
        previous = next;
      } else if (event.type === 'finished') {
        run(['close-control', 'show-main']);
        previous = 'stopped';
      } else if (event.type === 'error') {
        // A failure the person did not cause. The main window explains it in words.
        run(['close-control', 'show-main']);
      }
    },
  };
}
