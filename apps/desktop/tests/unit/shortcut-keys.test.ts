import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKeyPress,
  DEFAULT_ACCELERATORS,
  findShortcutConflict,
  isValidAccelerator,
  keysOfAccelerator,
  SHORTCUT_IDS,
  SHORTCUT_LABELS,
} from '../../src/shared/shortcut-keys';

const press = (
  key: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('isValidAccelerator', () => {
  it('accepts the defaults and other combinations with control or alt', () => {
    for (const id of SHORTCUT_IDS) expect(isValidAccelerator(DEFAULT_ACCELERATORS[id])).toBe(true);
    expect(isValidAccelerator('Alt+F9')).toBe(true);
    expect(isValidAccelerator('CommandOrControl+Alt+Shift+1')).toBe(true);
  });

  it.each([
    'R',
    'Shift+R',
    'CommandOrControl',
    'CommandOrControl+Space',
    'Ctrl+R',
    'CommandOrControl+CommandOrControl+R',
    'CommandOrControl+r',
    'CommandOrControl+F25',
  ])('rejects %s', (value) => {
    expect(isValidAccelerator(value)).toBe(false);
  });

  it('has a label for every shortcut', () => {
    for (const id of SHORTCUT_IDS) expect(SHORTCUT_LABELS[id].length).toBeGreaterThan(0);
  });
});

describe('acceleratorFromKeyPress', () => {
  it('turns control, shift and a letter into an accelerator in a fixed order', () => {
    expect(acceleratorFromKeyPress(press('r', { shiftKey: true, ctrlKey: true }))).toBe(
      'CommandOrControl+Shift+R',
    );
    expect(acceleratorFromKeyPress(press('k', { metaKey: true, altKey: true }))).toBe(
      'CommandOrControl+Alt+K',
    );
    expect(acceleratorFromKeyPress(press('F9', { altKey: true }))).toBe('Alt+F9');
  });

  it('waits while only modifiers are held, and refuses keys a shortcut cannot use', () => {
    expect(acceleratorFromKeyPress(press('Control', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKeyPress(press('Shift', { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKeyPress(press(' ', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKeyPress(press('r'))).toBeNull();
    expect(acceleratorFromKeyPress(press('r', { shiftKey: true }))).toBeNull();
  });
});

describe('keysOfAccelerator', () => {
  it('lists keycap labels, Ctrl or Cmd first', () => {
    expect(keysOfAccelerator('CommandOrControl+Shift+R')).toEqual(['Ctrl', 'Shift', 'R']);
    expect(keysOfAccelerator('Shift+Alt+CommandOrControl+R', true)).toEqual([
      'Cmd',
      'Alt',
      'Shift',
      'R',
    ]);
  });
});

describe('findShortcutConflict', () => {
  it('names the other shortcut that already uses the keys, ignoring case', () => {
    expect(findShortcutConflict('stop', 'commandorcontrol+shift+r', DEFAULT_ACCELERATORS)).toBe(
      'record',
    );
    expect(
      findShortcutConflict('record', DEFAULT_ACCELERATORS.record, DEFAULT_ACCELERATORS),
    ).toBeNull();
    expect(findShortcutConflict('record', 'Alt+F9', DEFAULT_ACCELERATORS)).toBeNull();
  });
});
