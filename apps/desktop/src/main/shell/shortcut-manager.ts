import { SHORTCUT_IDS, type ShortcutId } from '../../shared/shortcut-keys';
import {
  registerGlobalShortcuts,
  type ShortcutActions,
  type ShortcutApi,
  type ShortcutRegistration,
} from './global-shortcuts';

type Accelerators = Readonly<Record<ShortcutId, string>>;

/**
 * Keeps the global shortcuts in step with the settings: a changed key is unregistered and the new one
 * registered at once, and a key that another program owns is remembered so the settings page can say so.
 */
export function createShortcutManager(options: {
  api: ShortcutApi;
  actions: ShortcutActions;
  onError: (id: ShortcutId, error: unknown) => void;
  log: (event: string, ids: readonly ShortcutId[]) => void;
}) {
  let registration: ShortcutRegistration | undefined;
  let current: Accelerators | undefined;
  let suspended = false;

  const register = (accelerators: Accelerators): void => {
    registration = registerGlobalShortcuts({
      api: options.api,
      actions: options.actions,
      accelerators,
      onError: options.onError,
    });
    if (registration.unavailable.length > 0) {
      options.log('shortcut.unavailable', registration.unavailable);
    }
  };

  return {
    /** Registers these keys, after letting go of the previous ones. Does nothing when nothing changed. */
    apply(accelerators: Accelerators): void {
      if (current !== undefined && SHORTCUT_IDS.every((id) => current?.[id] === accelerators[id])) {
        return;
      }
      registration?.dispose();
      current = { ...accelerators };
      registration = undefined;
      if (!suspended) register(current);
    },
    /** Lets go of every key, or registers them again. Used while the settings page chooses a key. */
    suspend(value: boolean): void {
      if (value === suspended) return;
      suspended = value;
      if (value) {
        registration?.dispose();
        registration = undefined;
      } else if (current !== undefined) {
        register(current);
      }
    },
    /** The shortcuts another program already owns. */
    unavailable(): ShortcutId[] {
      return registration === undefined ? [] : [...registration.unavailable];
    },
    dispose(): void {
      registration?.dispose();
      registration = undefined;
      current = undefined;
    },
  };
}
