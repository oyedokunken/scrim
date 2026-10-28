export interface CloseState {
  platform: NodeJS.Platform;
  /** A recording is running or paused. */
  recording: boolean;
  /** The tray icon exists and the desktop shows it. */
  trayAvailable: boolean;
  /** The app is already on its way out (tray Quit, Cmd+Q, system shutdown). */
  quitting: boolean;
  /** The person chose to keep recording after the close dialog. */
  keepRunning: boolean;
}

/**
 * What closing the main window does.
 *  quit      let the window close and the app quit
 *  hide      keep the app running with the window hidden (tray, or the dock on macOS)
 *  minimize  keep the app running with the window minimized, where there is no tray to return from
 *  ask       show the close dialog, because a recording would otherwise be lost or left hidden
 */
export type CloseDecision = 'quit' | 'hide' | 'minimize' | 'ask';

/** Pure, so every platform and recording state can be table tested. */
export function decideClose(state: CloseState): CloseDecision {
  if (state.quitting) return 'quit';
  if (state.recording) {
    if (!state.keepRunning) return 'ask';
    // Hiding is only safe where the person can bring the window back.
    if (state.platform === 'darwin') return 'hide';
    return state.trayAvailable ? 'hide' : 'minimize';
  }
  return state.platform === 'darwin' ? 'hide' : 'quit';
}

export type CloseChoice = 'keep' | 'stop' | 'cancel';

/** The dialog buttons in order: keep, stop and save, cancel. Anything else is a cancel. */
export function closeChoice(response: number): CloseChoice {
  if (response === 0) return 'keep';
  if (response === 1) return 'stop';
  return 'cancel';
}

export interface CloseDialogCopy {
  buttons: [string, string, string];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
}

/** The words in the close dialog. Cancel is the safe default, so a stray Enter never stops a recording. */
export function closeDialogCopy(trayAvailable: boolean): CloseDialogCopy {
  return {
    buttons: [
      trayAvailable ? 'Keep recording in the tray' : 'Keep recording and minimize',
      'Stop and save',
      'Cancel',
    ],
    defaultId: 2,
    cancelId: 2,
    title: 'Scrim',
    message: 'A recording is in progress.',
    detail:
      'Stop and save finishes the recording and keeps the file. Keep recording leaves it running in the background. Nothing is discarded either way.',
  };
}
