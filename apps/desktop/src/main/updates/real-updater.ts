import { autoUpdater } from 'electron-updater';
import type { UpdaterLike } from './update-controller';

export interface RealUpdaterOptions {
  /**
   * A feed to use instead of the one baked into the installed app. Only a development run under
   * the end to end tests passes it (see index.ts), so a packaged app can never be pointed elsewhere.
   */
  testFeedUrl?: string;
}

/**
 * The real updater, from electron-updater, with GitHub Releases as the source (the feed is written
 * into the installed app by electron-builder). It is the only file that imports the library.
 *
 * Nothing runs by itself: no download, and no install when the app quits. Both wait for the person.
 */
export function createRealUpdater(options: RealUpdaterOptions = {}): UpdaterLike {
  const updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  // The library logs request addresses to the console by default. The app has its own local log.
  updater.logger = null;
  // The update request has its own session, so it can use the system proxy while every other
  // session stays on --no-proxy-server (ADR 0006). If this fails, a direct connection is used.
  void updater.netSession.setProxy({ mode: 'system' }).catch(() => undefined);
  if (options.testFeedUrl !== undefined) {
    updater.forceDevUpdateConfig = true;
    updater.setFeedURL({ provider: 'generic', url: options.testFeedUrl });
  }

  return {
    checkForUpdates: async () => {
      const result = await updater.checkForUpdates();
      return result === null
        ? null
        : { isUpdateAvailable: result.isUpdateAvailable, updateInfo: result.updateInfo };
    },
    downloadUpdate: () => updater.downloadUpdate(),
    quitAndInstall: () => {
      // Not silent, so the installer shows its own progress, and the app opens again afterwards.
      updater.quitAndInstall(false, true);
    },
    onProgress: (listener) => {
      updater.on('download-progress', (progress) => {
        listener(progress.percent);
      });
    },
  };
}
