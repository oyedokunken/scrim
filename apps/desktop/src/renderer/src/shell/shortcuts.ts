/** The default global shortcuts. One list, so every keycap in the app reads from the same place. */
export const SHORTCUTS = {
  record: { label: 'Start recording', keys: ['Ctrl', 'Shift', 'R'] },
  stop: { label: 'Stop and save', keys: ['Ctrl', 'Shift', 'S'] },
  screenshot: { label: 'Take screenshot', keys: ['Ctrl', 'Shift', 'X'] },
} as const;

type ShortcutId = keyof typeof SHORTCUTS;
