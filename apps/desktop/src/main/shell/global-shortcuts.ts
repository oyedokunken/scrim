import { DEFAULT_ACCELERATORS, type ShortcutId } from '../../shared/shortcut-keys';

export { DEFAULT_ACCELERATORS, type ShortcutId };

/** The slice of Electron's `globalShortcut` this module needs, so tests can stand in for it. */
export interface ShortcutApi {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
}

export interface ShortcutActions {
  isRecording: () => boolean;
  record: () => Promise<void>;
  stop: () => Promise<void>;
  /** Left out until screenshots exist, and then its shortcut is simply not registered. */
  screenshot?: () => Promise<void>;
}

export interface ShortcutRegistration {
  /** Shortcuts another app already owns. The app still works from its buttons. */
  unavailable: ShortcutId[];
  dispose: () => void;
}

/**
 * Registers the global shortcuts. Starting while recording and stopping while idle do nothing, so a
 * held key or a second press never double-starts or throws. A failed action is reported, not thrown,
 * because it runs from an operating system callback with nobody to catch it.
 */
export function registerGlobalShortcuts(options: {
  api: ShortcutApi;
  actions: ShortcutActions;
  accelerators?: Readonly<Record<ShortcutId, string>>;
  onError: (id: ShortcutId, error: unknown) => void;
}): ShortcutRegistration {
  const { api, actions, onError } = options;
  const accelerators = options.accelerators ?? DEFAULT_ACCELERATORS;
  const registered: string[] = [];
  const unavailable: ShortcutId[] = [];

  const guarded =
    (id: ShortcutId, allowed: () => boolean, run: () => Promise<void>) => (): void => {
      if (!allowed()) return;
      run().catch((error: unknown) => {
        onError(id, error);
      });
    };

  const entries: [ShortcutId, () => void][] = [
    ['record', guarded('record', () => !actions.isRecording(), actions.record)],
    ['stop', guarded('stop', () => actions.isRecording(), actions.stop)],
  ];
  const screenshot = actions.screenshot;
  if (screenshot) {
    entries.push(['screenshot', guarded('screenshot', () => !actions.isRecording(), screenshot)]);
  }

  for (const [id, callback] of entries) {
    const accelerator = accelerators[id];
    if (api.register(accelerator, callback)) registered.push(accelerator);
    else unavailable.push(id);
  }

  return {
    unavailable,
    dispose() {
      for (const accelerator of registered) api.unregister(accelerator);
      registered.length = 0;
    },
  };
}
