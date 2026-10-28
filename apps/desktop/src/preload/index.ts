import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, EVENT_CHANNELS } from '../shared/channels';
import type { ScrimApi } from '../shared/scrim-api';

// The sandboxed preload imports no library, only the channel names. The main process checks the
// sender, the input and the output of every call, so this file only refuses names it does not know.
const channels: ReadonlySet<string> = new Set(CHANNELS);
const eventChannels: ReadonlySet<string> = new Set(EVENT_CHANNELS);

const api: ScrimApi = {
  invoke(channel, ...args) {
    if (!channels.has(channel)) return Promise.reject(new Error('Unknown channel.'));
    return ipcRenderer.invoke(channel, ...args) as Promise<never>;
  },
  on(event, listener) {
    if (!eventChannels.has(event)) throw new Error('Unknown event.');
    // The Electron event object is not handed to the page, only the payload.
    const handler = (_event: unknown, payload: Parameters<typeof listener>[0]): void => {
      listener(payload);
    };
    ipcRenderer.on(event, handler);
    return () => {
      ipcRenderer.removeListener(event, handler);
    };
  },
};

contextBridge.exposeInMainWorld('scrim', api);
