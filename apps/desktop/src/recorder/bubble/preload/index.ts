import { contextBridge, ipcRenderer } from 'electron';
import { BUBBLE_CHANNELS } from '../channels';

/** The only door between the camera bubble page and the main process. */
contextBridge.exposeInMainWorld('scrimBubble', {
  onCommand(callback: (command: unknown) => void): void {
    ipcRenderer.on(BUBBLE_CHANNELS.command, (_event, command: unknown) => {
      callback(command);
    });
  },
  send(event: unknown): void {
    ipcRenderer.send(BUBBLE_CHANNELS.event, event);
  },
});
