import { contextBridge, ipcRenderer } from 'electron';
import { REGION_CHANNELS } from '../protocol';

/**
 * The only door between a region overlay page and the main process. Commands come in, events go
 * out, and main checks every event. It exposes nothing else.
 */
contextBridge.exposeInMainWorld('scrimRegion', {
  onCommand(callback: (command: unknown) => void): void {
    ipcRenderer.on(REGION_CHANNELS.command, (_event, command: unknown) => {
      callback(command);
    });
  },
  send(event: unknown): void {
    ipcRenderer.send(REGION_CHANNELS.event, event);
  },
});
