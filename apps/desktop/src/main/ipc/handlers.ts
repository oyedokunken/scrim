import { isAbsolute, resolve } from 'node:path';
import { isInsideRoot } from '../app-protocol';
import type { Settings } from '../../shared/settings';
import { acceleratorsOf, SHORTCUT_IDS, type ShortcutId } from '../../shared/shortcut-keys';
import type { SettingsStore } from '../settings/settings-store';
import type { Handlers } from './dispatcher';
import { createAreaHandlers, type AreaApi } from './area-handlers';
import { createImageHandlers, type ImageDeps } from './image-handlers';
import { createEditorHandlers, type EditorDeps } from '../editor/editor-handlers';
import { createLibraryHandlers } from '../library/library-handlers';
import type { Library } from '../library/library';
import { createRecordingHandlers, type RecordingApi } from './recording-handlers';

/** Everything the handlers need from the outside world, so a test can supply fakes. */
export interface HandlerDeps {
  settings: SettingsStore;
  recording: RecordingApi;
  area: AreaApi;
  /** The file and clipboard work behind the screenshot result and editor. */
  images: Omit<ImageDeps, 'platform' | 'screenshotFolder' | 'share'>;
  /** Reading a recording for the editor and saving its edits. */
  editor: EditorDeps;
  /** The recordings and screenshots listing and its actions. */
  library: Library;
  /** The Windows share sheet. Null when this computer has none Scrim can open. */
  share: ((path: string) => Promise<void>) | null;
  platform: NodeJS.Platform;
  /** The app version from the package, never typed in by hand. */
  version: string;
  /** Where screenshots are saved when the person has not chosen a folder, Pictures\Scrim. */
  defaultScreenshotFolder: () => string;
  /** Where recordings are exported when the person has not chosen a folder, Videos\Scrim. */
  defaultRecordingsFolder: () => string;
  /** Creates a folder if it is missing, so Open works before the first save. */
  ensureFolder: (path: string) => Promise<void>;
  /** Opens the system folder picker, starting in the given folder. Null when the person cancels. */
  chooseFolder: (startIn: string) => Promise<string | null>;
  showItemInFolder: (path: string) => void;
  /** Resolves to an error text, or an empty string on success, like `shell.openPath`. */
  openPath: (path: string) => Promise<string>;
  /** Opens a link only if the allowlist accepts it, and says whether it did. */
  openExternal: (url: string) => Promise<boolean>;
  /** The page's answer to the close question. */
  closeAnswer: (answer: 'shown' | 'keep' | 'stop' | 'cancel') => void;
  /** The shortcuts another program owns. */
  shortcutStatus: () => readonly ShortcutId[];
  /** Lets go of the shortcuts, or takes them back, while the settings page chooses a key. */
  shortcutsSuspend: (suspended: boolean) => void;
  /** Old working folders in the folder for finished videos, and moving them out. Moves, never deletes. */
  legacy: { count: () => Promise<number>; move: () => Promise<{ moved: number; failed: number }> };
  /** The logs folder, fixed by the app. The renderer never supplies it. */
  logsFolder: string;
  /** Recording folders besides the destination, such as the sessions that exist right now. */
  extraKnownFolders?: () => readonly string[];
}

/**
 * Whether a path is inside a folder Scrim writes recordings to. `..` and mixed case are resolved
 * first, a relative path is never accepted, and a sibling folder that only shares a name prefix
 * does not count.
 */
export function isInsideKnownFolder(
  path: string,
  folders: readonly string[],
  platform: NodeJS.Platform,
): boolean {
  if (path.includes('\0') || !isAbsolute(path)) return false;
  const target = resolve(path);
  const caseInsensitive = platform === 'win32' || platform === 'darwin';
  return folders.some((folder) => isInsideRoot(resolve(folder), target, caseInsensitive));
}

/** The folder screenshots go to: the one the person chose, or Pictures\Scrim. */
export function screenshotFolderOf(saved: Settings, fallback: string): string {
  return saved.screenshotFolder ?? fallback;
}

function definedOnly(patch: object): object {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

export function createHandlers(deps: HandlerDeps): Handlers {
  const screenshotFolder = (): string =>
    screenshotFolderOf(deps.settings.get(), deps.defaultScreenshotFolder());
  return {
    'settings:get': () => deps.settings.get(),
    'settings:set': (patch) => {
      // Two actions on one key would make one of them unreachable, so that is refused here as well.
      const next = { ...deps.settings.get(), ...definedOnly(patch) };
      const keys = SHORTCUT_IDS.map((id) => acceleratorsOf(next)[id].toLowerCase());
      if (new Set(keys).size !== keys.length) throw new Error('shortcuts must differ');
      return deps.settings.set(patch);
    },
    'window:close-answer': ({ answer }) => {
      deps.closeAnswer(answer);
    },
    'shortcuts:status': () => ({ unavailable: [...deps.shortcutStatus()] }),
    'shortcuts:suspend': ({ suspended }) => {
      deps.shortcutsSuspend(suspended);
    },
    'legacy:count': () => deps.legacy.count(),
    'legacy:move': () => deps.legacy.move(),
    // Choosing a folder is how the destination is set. Only this handler writes it, so the page
    // cannot send a recording somewhere the person never picked.
    'folder:choose': async ({ kind }) => {
      const chosen = await deps.chooseFolder(
        kind === 'recordings'
          ? (deps.settings.get().destinationFolder ?? deps.defaultRecordingsFolder())
          : screenshotFolder(),
      );
      if (chosen !== null) {
        await deps.settings.set(
          kind === 'recordings' ? { destinationFolder: chosen } : { screenshotFolder: chosen },
        );
      }
      return chosen;
    },
    'folder:open': async ({ kind }) => {
      const saved = deps.settings.get();
      const folder =
        kind === 'recordings'
          ? (saved.destinationFolder ?? deps.defaultRecordingsFolder())
          : screenshotFolder();
      await deps.ensureFolder(folder);
      if ((await deps.openPath(folder)) !== '') throw new Error('could not open folder');
    },
    'app:version': () => deps.version,
    'shell:open-external': async ({ url }) => {
      if (!(await deps.openExternal(url))) throw new Error('link not allowed');
    },
    'shell:show-in-folder': ({ path }) => {
      const destination = deps.settings.get().destinationFolder;
      const known = [
        destination ?? deps.defaultRecordingsFolder(),
        screenshotFolder(),
        ...(deps.extraKnownFolders?.() ?? []),
      ];
      if (!isInsideKnownFolder(path, known, deps.platform)) throw new Error('path not allowed');
      deps.showItemInFolder(resolve(path));
    },
    ...createRecordingHandlers({
      recording: deps.recording,
      destination: () => deps.settings.get().destinationFolder,
    }),
    ...createAreaHandlers({
      area: deps.area,
      settings: () => deps.settings.get(),
      screenshotFolder,
    }),
    ...createImageHandlers({
      ...deps.images,
      share: deps.share,
      platform: deps.platform,
      screenshotFolder,
    }),
    ...createEditorHandlers(deps.editor).handlers,
    ...createLibraryHandlers({ library: deps.library, canShare: () => deps.share !== null }),
    'logs:open-folder': async () => {
      if ((await deps.openPath(deps.logsFolder)) !== '') throw new Error('could not open logs');
    },
  };
}
