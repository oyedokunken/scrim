import { ipcMain, MessageChannelMain, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { RECORDER_CHANNELS, type RecorderCommand, type TrackKind } from '../../recorder/protocol';
import { recorderEventSchema } from '../../recorder/protocol-schemas';
import { originOf } from '../renderer-target';
import { createAppWindow } from '../windows/create-window';
import type { ChunkPort, RecorderTransport } from './recorder-host';

export interface RecorderWindowOptions {
  /** The origin the app serves from. Events are accepted only from a page on it. */
  appOrigin: string;
  log?: (message: string) => void;
}

/** The recorder page, served next to the app window: `app://scrim/recorder.html` or the dev server. */
function recorderPageUrl(appOrigin: string): string {
  return `${appOrigin}/recorder.html`;
}

/**
 * Opens the hidden recorder window and wraps it as a transport. The window has no menu, is never
 * shown, keeps its timers running while hidden (a throttled recorder would drop frames), and gets
 * the same security baseline as every other window. Only events from its own web contents and
 * from our own origin are accepted, and each one is checked against the schema.
 */
export function openRecorderWindow(options: RecorderWindowOptions): RecorderTransport {
  const log = options.log ?? (() => undefined);
  const window: BrowserWindow = createAppWindow(
    {
      show: false,
      width: 320,
      height: 240,
      webPreferences: {
        preload: join(__dirname, '../preload/recorder.js'),
        backgroundThrottling: false,
      },
    },
    'helper',
  );
  const contents = window.webContents;
  const eventListeners = new Set<(event: ReturnType<typeof recorderEventSchema.parse>) => void>();
  const goneListeners = new Set<(reason: string) => void>();
  let markLoaded: () => void = () => undefined;
  const loaded = new Promise<void>((resolve) => {
    markLoaded = resolve;
  });
  let closed = false;

  const onEvent = (ipcEvent: Electron.IpcMainEvent, payload: unknown): void => {
    if (ipcEvent.sender !== contents) return;
    const origin = ipcEvent.senderFrame === null ? '' : originOf(ipcEvent.senderFrame.url);
    if (origin !== options.appOrigin) {
      log('Ignored a recorder event from an unexpected origin.');
      return;
    }
    const parsed = recorderEventSchema.safeParse(payload);
    if (!parsed.success) {
      log('Ignored a recorder event that did not match the schema.');
      return;
    }
    if (parsed.data.type === 'loaded') {
      markLoaded();
      return;
    }
    for (const listener of eventListeners) listener(parsed.data);
  };
  ipcMain.on(RECORDER_CHANNELS.event, onEvent);

  contents.on('render-process-gone', (_event, details) => {
    for (const listener of goneListeners) listener(details.reason);
  });

  void window.loadURL(recorderPageUrl(options.appOrigin)).catch((error: unknown) => {
    log(`The recorder page did not load: ${error instanceof Error ? error.message : 'unknown'}`);
    for (const listener of goneListeners) listener('page-load-failed');
  });

  return {
    send(command: RecorderCommand) {
      if (!closed && !contents.isDestroyed()) contents.send(RECORDER_CHANNELS.command, command);
    },
    openChunkPorts(kinds: readonly TrackKind[]) {
      const mine: Partial<Record<TrackKind, ChunkPort>> = {};
      const theirs = [];
      for (const kind of kinds) {
        const { port1, port2 } = new MessageChannelMain();
        port1.start();
        mine[kind] = {
          onMessage(callback) {
            port1.on('message', (message) => {
              callback(message.data);
            });
          },
          close() {
            port1.close();
          },
        };
        theirs.push(port2);
      }
      contents.postMessage(RECORDER_CHANNELS.ports, kinds, theirs);
      return mine;
    },
    onEvent(callback) {
      eventListeners.add(callback);
      return () => eventListeners.delete(callback);
    },
    onGone(callback) {
      goneListeners.add(callback);
      return () => goneListeners.delete(callback);
    },
    loaded: () => loaded,
    close() {
      if (closed) return;
      closed = true;
      ipcMain.off(RECORDER_CHANNELS.event, onEvent);
      eventListeners.clear();
      goneListeners.clear();
      if (!window.isDestroyed()) window.destroy();
    },
  };
}
