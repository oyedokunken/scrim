import { describe, expect, it } from 'vitest';
import {
  closeChoice,
  closeDialogCopy,
  decideClose,
  type CloseDecision,
  type CloseState,
} from '../../src/main/shell/close-policy';

type Row = [CloseState['platform'], boolean, boolean, boolean, boolean, CloseDecision];

// platform, recording, trayAvailable, quitting, keepRunning -> decision
const rows: Row[] = [
  // Not recording: Windows and Linux quit, macOS keeps the app in the dock.
  ['win32', false, true, false, false, 'quit'],
  ['win32', false, false, false, false, 'quit'],
  ['linux', false, true, false, false, 'quit'],
  ['linux', false, false, false, false, 'quit'],
  ['darwin', false, true, false, false, 'hide'],
  ['darwin', false, false, false, false, 'hide'],
  // Recording and the person has not decided: always ask, on every platform.
  ['win32', true, true, false, false, 'ask'],
  ['win32', true, false, false, false, 'ask'],
  ['linux', true, true, false, false, 'ask'],
  ['linux', true, false, false, false, 'ask'],
  ['darwin', true, true, false, false, 'ask'],
  ['darwin', true, false, false, false, 'ask'],
  // Recording and the person chose to keep going: hide to the tray, or minimize without one.
  ['win32', true, true, false, true, 'hide'],
  ['win32', true, false, false, true, 'minimize'],
  ['linux', true, true, false, true, 'hide'],
  ['linux', true, false, false, true, 'minimize'],
  ['darwin', true, true, false, true, 'hide'],
  ['darwin', true, false, false, true, 'hide'],
  // Already quitting (tray Quit, Cmd+Q, shutdown): never block the close.
  ['win32', true, true, true, false, 'quit'],
  ['linux', true, false, true, false, 'quit'],
  ['darwin', true, true, true, false, 'quit'],
  ['darwin', false, true, true, false, 'quit'],
];

describe('decideClose', () => {
  it.each(rows)(
    '%s recording=%s tray=%s quitting=%s keepRunning=%s -> %s',
    (platform, recording, trayAvailable, quitting, keepRunning, expected) => {
      expect(decideClose({ platform, recording, trayAvailable, quitting, keepRunning })).toBe(
        expected,
      );
    },
  );

  it('always asks first when a recording is running and nothing was decided', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      for (const trayAvailable of [true, false]) {
        const decision = decideClose({
          platform,
          recording: true,
          trayAvailable,
          quitting: false,
          keepRunning: false,
        });
        expect(decision).toBe('ask');
      }
    }
  });
});

describe('closeChoice', () => {
  it.each([
    [0, 'keep'],
    [1, 'stop'],
    [2, 'cancel'],
    [-1, 'cancel'],
    [7, 'cancel'],
  ] as const)('response %i is %s', (response, expected) => {
    expect(closeChoice(response)).toBe(expected);
  });
});

describe('closeDialogCopy', () => {
  it('offers the three agreed actions and defaults to the safe one', () => {
    const copy = closeDialogCopy(true);
    expect(copy.buttons).toEqual(['Keep recording in the tray', 'Stop and save', 'Cancel']);
    expect(copy.defaultId).toBe(2);
    expect(copy.cancelId).toBe(2);
  });

  it('does not promise a tray when there is none', () => {
    expect(closeDialogCopy(false).buttons[0]).toBe('Keep recording and minimize');
  });

  it('says nothing is discarded', () => {
    expect(closeDialogCopy(true).detail).toMatch(/Nothing is discarded/);
  });
});
