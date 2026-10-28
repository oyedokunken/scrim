import { contextBridge, ipcRenderer } from 'electron';
import { PILL_CHANNELS } from '../channels';

/**
 * The only door between the recording pill page and the main process. The state comes in, the
 * actions go out, and main checks every action. It exposes nothing else.
 */
contextBridge.exposeInMainWorld('scrimPill', {
  onState(callback: (state: unknown) => void): void {
    ipcRenderer.on(PILL_CHANNELS.state, (_event, state: unknown) => {
      callback(state);
    });
  },
  send(action: unknown): void {
    ipcRenderer.send(PILL_CHANNELS.action, action);
  },
});
