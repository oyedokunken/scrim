/**
 * Global shortcuts as Electron accelerators, and the pure helpers around them. The settings page,
 * the settings schema and the main process all use this one file, so what the page lets someone
 * press is exactly what the main process will register.
 */
export const SHORTCUT_IDS = ['record', 'stop', 'screenshot'] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export const DEFAULT_ACCELERATORS: Readonly<Record<ShortcutId, string>> = Object.freeze({
  record: 'CommandOrControl+Shift+R',
  stop: 'CommandOrControl+Shift+S',
  screenshot: 'CommandOrControl+Shift+X',
});

export const SHORTCUT_LABELS: Readonly<Record<ShortcutId, string>> = Object.freeze({
  record: 'Start recording',
  stop: 'Stop and save',
  screenshot: 'Take screenshot',
});

/**
 * One or more modifiers, then one letter, digit or function key. Control or Alt must be among the
 * modifiers, because Shift alone would swallow ordinary typing in every other app.
 */
const ACCELERATOR =
  /^(?:(?:CommandOrControl|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/;
const MODIFIER_ORDER = ['CommandOrControl', 'Alt', 'Shift'] as const;

export function isValidAccelerator(value: string): boolean {
  if (!ACCELERATOR.test(value)) return false;
  const parts = value.split('+');
  const modifiers = parts.slice(0, -1);
  if (new Set(modifiers).size !== modifiers.length) return false;
  return modifiers.includes('CommandOrControl') || modifiers.includes('Alt');
}

interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The accelerator for a key press, or null while only modifiers are held or the key is not one a
 * global shortcut can use. Ctrl and Cmd both mean CommandOrControl, as they do in the defaults.
 */
export function acceleratorFromKeyPress(press: KeyPress): string | null {
  const key = press.key.length === 1 ? press.key.toUpperCase() : press.key;
  const isFunction = /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key);
  if (!isFunction && !/^[A-Z0-9]$/.test(key)) return null;
  const modifiers: string[] = [];
  if (press.ctrlKey || press.metaKey) modifiers.push('CommandOrControl');
  if (press.altKey) modifiers.push('Alt');
  if (press.shiftKey) modifiers.push('Shift');
  const accelerator = [...modifiers, key].join('+');
  return isValidAccelerator(accelerator) ? accelerator : null;
}

/** `CommandOrControl+Shift+R` as keycap labels: Ctrl, Shift, R. */
export function keysOfAccelerator(accelerator: string, mac = false): string[] {
  const parts = accelerator.split('+');
  const key = parts[parts.length - 1] ?? '';
  const modifiers = parts
    .slice(0, -1)
    .sort((a, b) => MODIFIER_ORDER.indexOf(a as never) - MODIFIER_ORDER.indexOf(b as never))
    .map((name) => (name === 'CommandOrControl' ? (mac ? 'Cmd' : 'Ctrl') : name));
  return [...modifiers, key];
}

/** The other shortcut that already uses this accelerator, or null. */
export function findShortcutConflict(
  id: ShortcutId,
  accelerator: string,
  all: Readonly<Record<ShortcutId, string>>,
): ShortcutId | null {
  for (const other of SHORTCUT_IDS) {
    if (other !== id && all[other].toLowerCase() === accelerator.toLowerCase()) return other;
  }
  return null;
}

/** The three accelerators saved in settings. */
export function acceleratorsOf(settings: {
  shortcutRecord: string;
  shortcutStop: string;
  shortcutScreenshot: string;
}): Readonly<Record<ShortcutId, string>> {
  return {
    record: settings.shortcutRecord,
    stop: settings.shortcutStop,
    screenshot: settings.shortcutScreenshot,
  };
}
