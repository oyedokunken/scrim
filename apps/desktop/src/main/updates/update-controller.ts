import type {
  UpdateBlock,
  UpdateInfo,
  UpdateSnapshot,
  UpdateState,
} from '../../shared/updates-contract';
import { classifyUpdateError } from './update-errors';

/** What the update flow reads from a check. The real updater's result has these and more. */
export interface UpdateCheckLike {
  isUpdateAvailable: boolean;
  updateInfo: {
    version: string;
    releaseNotes?: string | readonly { note?: string | null }[] | null;
    files?: readonly { size?: number }[];
  };
}

/**
 * The few things the flow needs from the updater. The real one comes from electron-updater, and a
 * test hands in a fake or one that talks to a local server, so no test needs Electron.
 */
export interface UpdaterLike {
  checkForUpdates: () => Promise<UpdateCheckLike | null>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => void;
  /** Calls the listener with the percent done while a download runs. */
  onProgress: (listener: (percent: number) => void) => void;
}

export interface UpdateControllerDeps {
  /** Null when this install cannot update itself, with the reason in `unsupported`. */
  updater: UpdaterLike | null;
  unsupported: string;
  /** Recording or exporting right now, or null. The editor is tracked by `setEditing`. */
  busy: () => Exclude<UpdateBlock, 'editing'> | null;
  /** Only an event name and plain values. Never a version string from the network, a path or a name. */
  log: (event: string, fields: Record<string, string | number | boolean>) => void;
  onChange: (snapshot: UpdateSnapshot) => void;
}

export interface UpdateController {
  snapshot: () => UpdateSnapshot;
  /** `automatic` is the check at startup: it is quiet, so a failure is logged and not shown. */
  check: (options?: { automatic?: boolean }) => Promise<UpdateSnapshot>;
  download: () => Promise<UpdateSnapshot>;
  install: () => void;
  setEditing: (editing: boolean) => void;
}

const MAX_NOTES = 4000;

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Release notes arrive as the release page's HTML. The page shows plain text only: tags are
 * removed, a few entities are decoded, and nothing is ever rendered as markup.
 */
export function notesToText(notes: UpdateCheckLike['updateInfo']['releaseNotes']): string {
  const raw =
    typeof notes === 'string'
      ? notes
      : (notes ?? [])
          .map((entry) => entry.note ?? '')
          .filter((note) => note !== '')
          .join('\n\n');
  const text = raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_NOTES ? `${text.slice(0, MAX_NOTES - 3).trimEnd()}...` : text;
}

/** The largest file of the release, which is the download the person waits for. */
function sizeOf(files: UpdateCheckLike['updateInfo']['files']): number | null {
  const sizes = (files ?? [])
    .map((file) => file.size)
    .filter(
      (size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0,
    );
  return sizes.length === 0 ? null : Math.round(Math.max(...sizes));
}

function infoOf(result: UpdateCheckLike): UpdateInfo {
  return {
    version: result.updateInfo.version.slice(0, 64),
    notes: notesToText(result.updateInfo.releaseNotes),
    sizeBytes: sizeOf(result.updateInfo.files),
  };
}

/**
 * The update flow. It checks only when asked (the button, or the startup check when the person
 * turned it on), downloads only when the person pressed Update now, and installs only when the
 * person chose the restart. It does nothing while a recording, an export or the editor is active.
 * A failed check or download leaves the installed app as it was, because nothing is installed
 * before the restart.
 */
export function createUpdateController(deps: UpdateControllerDeps): UpdateController {
  const { updater } = deps;
  let state: UpdateState =
    updater === null ? { phase: 'unsupported', message: deps.unsupported } : { phase: 'idle' };
  let editing = false;
  let lastPercent = -1;

  const blocked = (): UpdateBlock | null => deps.busy() ?? (editing ? 'editing' : null);
  const snapshot = (): UpdateSnapshot => ({ state, blocked: blocked() });
  const set = (next: UpdateState): UpdateSnapshot => {
    state = next;
    const shot = snapshot();
    deps.onChange(shot);
    return shot;
  };

  updater?.onProgress((percent) => {
    if (state.phase !== 'downloading') return;
    const whole = Math.max(0, Math.min(100, Math.floor(percent)));
    if (whole === lastPercent) return;
    lastPercent = whole;
    set({ phase: 'downloading', info: state.info, percent: whole });
  });

  return {
    snapshot,
    setEditing: (value) => {
      editing = value;
    },
    check: async (options) => {
      if (updater === null) return snapshot();
      if (state.phase === 'checking' || state.phase === 'downloading') return snapshot();
      if (blocked() !== null) {
        deps.log('updates.check-skipped', { automatic: options?.automatic === true });
        return snapshot();
      }
      const before = state;
      set({ phase: 'checking' });
      try {
        const result = await updater.checkForUpdates();
        if (result === null || !result.isUpdateAvailable) {
          deps.log('updates.checked', { available: false });
          return set({ phase: 'none' });
        }
        deps.log('updates.checked', { available: true });
        return set({ phase: 'available', info: infoOf(result) });
      } catch (error) {
        const failure = classifyUpdateError(error);
        deps.log('updates.check-failed', {
          kind: failure.kind,
          automatic: options?.automatic === true,
        });
        // The startup check never shows an error. The person did not ask for it.
        if (options?.automatic === true) {
          return set(before);
        }
        return set({ phase: 'error', ...failure });
      }
    },
    download: async () => {
      const current = state;
      const info =
        current.phase === 'available' || current.phase === 'ready'
          ? current.info
          : current.phase === 'error'
            ? current.info
            : undefined;
      if (updater === null || info === undefined || current.phase === 'ready') return snapshot();
      if (blocked() !== null) {
        deps.log('updates.download-skipped', {});
        return snapshot();
      }
      lastPercent = -1;
      set({ phase: 'downloading', info, percent: 0 });
      try {
        await updater.downloadUpdate();
        deps.log('updates.downloaded', {});
        return set({ phase: 'ready', info });
      } catch (error) {
        const failure = classifyUpdateError(error);
        deps.log('updates.download-failed', { kind: failure.kind });
        return set({ phase: 'error', ...failure, info });
      }
    },
    install: () => {
      if (updater === null || state.phase !== 'ready') throw new Error('no update is ready');
      if (blocked() !== null) throw new Error('busy');
      deps.log('updates.install', {});
      updater.quitAndInstall();
    },
  };
}

/**
 * The check at start, when the person turned it on. It waits, so starting a recording right away
 * is never slowed by it, and it asks again whether the setting is still on when the time comes.
 * Returns whether a check was scheduled.
 */
export function scheduleStartupCheck(options: {
  enabled: () => boolean;
  check: () => Promise<unknown>;
  delayMs: number;
  setTimer: (run: () => void, ms: number) => void;
}): boolean {
  if (!options.enabled()) return false;
  options.setTimer(() => {
    if (options.enabled()) void options.check();
  }, options.delayMs);
  return true;
}
