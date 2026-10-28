import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE_VERSION,
  settingsFileSchema,
  settingsChangeSchema,
  settingsSchema,
  type Settings,
  type SettingsChange,
} from '../../shared/settings';

/** The file system the store needs, so a test can make any call fail. */
export interface SettingsFs {
  /** Undefined when the file does not exist. */
  readText(path: string): Promise<string | undefined>;
  writeJsonAtomic(path: string, value: unknown): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface SettingsStoreOptions {
  path: string;
  fs: SettingsFs;
  now?: () => number;
  /** Called after a change has been written. */
  onChange?: (settings: Settings) => void;
  /** Receives an event name and plain fields, never settings values or file contents. */
  log?: (event: string, fields?: Record<string, string | number | boolean>) => void;
}

/** Drops keys whose value is undefined, which a zod partial allows but a merge must not apply. */
function defined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/**
 * Settings on disk. The file is validated when it is read: a missing setting takes its default,
 * a setting from a newer version is ignored, and a file that is broken or holds a value of the
 * wrong type is moved aside (never deleted) and replaced with the defaults. Writes go through an
 * atomic writer, one at a time, so a crash leaves the last whole file.
 */
export function createSettingsStore(options: SettingsStoreOptions) {
  const { path, fs, now = Date.now, onChange, log } = options;
  let current: Settings = { ...DEFAULT_SETTINGS };
  let queue: Promise<unknown> = Promise.resolve();

  const toFile = (settings: Settings) => ({ version: SETTINGS_FILE_VERSION, ...settings });

  async function moveAside(): Promise<void> {
    try {
      await fs.rename(path, `${path}.invalid-${now()}`);
    } catch {
      // If it cannot be moved, the next write replaces it. The app still starts.
    }
  }

  async function load(): Promise<Settings> {
    let text: string | undefined;
    try {
      text = await fs.readText(path);
    } catch {
      text = undefined;
    }
    if (text === undefined) {
      current = { ...DEFAULT_SETTINGS };
      return current;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const file = settingsFileSchema.safeParse(parsed);
    if (file.success) {
      const stored: Record<string, unknown> = { ...file.data };
      delete stored['version'];
      const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...defined(stored) });
      if (merged.success) {
        current = merged.data;
        return current;
      }
    }

    log?.('settings.invalid-file', { action: 'moved aside, defaults restored' });
    await moveAside();
    current = { ...DEFAULT_SETTINGS };
    try {
      await fs.writeJsonAtomic(path, toFile(current));
    } catch {
      // Defaults stay in memory. The next successful write puts them on disk.
    }
    return current;
  }

  function set(patch: SettingsChange): Promise<Settings> {
    const run = async (): Promise<Settings> => {
      const checked = settingsChangeSchema.parse(patch);
      const next = settingsSchema.parse({ ...current, ...defined(checked) });
      await fs.writeJsonAtomic(path, toFile(next));
      // Memory changes only after the file does, so a failed write never shows as saved.
      current = next;
      onChange?.(next);
      return next;
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    load,
    set,
    get: (): Settings => ({ ...current }),
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
