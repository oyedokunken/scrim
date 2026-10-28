import { isAbsolute, resolve } from 'node:path';
import { isInsideRoot } from '../app-protocol';
import type { Settings } from '../../shared/settings';
import type { SettingsStore } from '../settings/settings-store';
import type { Handlers } from './dispatcher';
import { createAreaHandlers, type AreaApi } from './area-handlers';
import { createImageHandlers, type ImageDeps } from './image-handlers';
import { createRecordingHandlers, type RecordingApi } from './recording-handlers';

/** Everything the handlers need from the outside world, so a test can supply fakes. */
export interface HandlerDeps {
  settings: SettingsStore;
  recording: RecordingApi;
  area: AreaApi;
  /** The file and clipboard work behind the screenshot result and editor. */
  images: Omit<ImageDeps, 'platform' | 'screenshotFolder'>;
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

export function createHandlers(deps: HandlerDeps): Handlers {
  const screenshotFolder = (): string =>
    screenshotFolderOf(deps.settings.get(), deps.defaultScreenshotFolder());
  return {
    'settings:get': () => deps.settings.get(),
    'settings:set': (patch) => deps.settings.set(patch),
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
      platform: deps.platform,
      screenshotFolder,
    }),
    'logs:open-folder': async () => {
      if ((await deps.openPath(deps.logsFolder)) !== '') throw new Error('could not open logs');
    },
  };
}
