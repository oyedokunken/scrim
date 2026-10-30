import type { UpdateCheckLike, UpdaterLike } from '../../../src/main/updates/update-controller';
import { sha512Of } from '../../support/mock-update-server';

export { startMockUpdateServer, type MockServer } from '../../support/mock-update-server';

function field(text: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*(?:- )?${key}: (.*)$`, 'm').exec(text);
  return match?.[1]?.trim().replace(/^'(.*)'$/, '$1');
}

/**
 * An updater that talks to the mock server over HTTP and checks the SHA-512 of the download, as
 * the real one does. It lets the update flow run against a real server without Electron. The real
 * electron-updater is not exercised by it.
 */
export function createHttpUpdater(base: string, currentVersion: string): UpdaterLike {
  let progress: (percent: number) => void = () => undefined;
  let pending: { url: string; sha512: string } | undefined;
  return {
    onProgress: (listener) => {
      progress = listener;
    },
    checkForUpdates: async (): Promise<UpdateCheckLike | null> => {
      const response = await fetch(`${base}/latest.yml`);
      if (!response.ok) throw new Error(`status code ${String(response.status)} for latest.yml`);
      const text = await response.text();
      const version = field(text, 'version') ?? '';
      const url = field(text, 'url') ?? '';
      const sha512 = field(text, 'sha512') ?? '';
      const size = Number(field(text, 'size') ?? '0');
      const notes = field(text, 'releaseNotes');
      pending = { url: `${base}/${url}`, sha512 };
      return {
        isUpdateAvailable: version !== '' && version !== currentVersion,
        updateInfo: {
          version,
          ...(notes === undefined ? {} : { releaseNotes: JSON.parse(notes) as string }),
          files: [{ size }],
        },
      };
    },
    downloadUpdate: async () => {
      if (pending === undefined) throw new Error('nothing to download');
      const response = await fetch(pending.url);
      if (!response.ok) throw new Error(`status code ${String(response.status)}`);
      const data = Buffer.from(await response.arrayBuffer());
      progress(50);
      progress(100);
      if (sha512Of(data) !== pending.sha512) throw new Error('sha512 checksum mismatch');
      return data;
    },
    quitAndInstall: () => undefined,
  };
}
