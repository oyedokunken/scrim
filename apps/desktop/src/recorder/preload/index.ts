import { contextBridge, ipcRenderer } from 'electron';
import { PORTS_MESSAGE_TYPE, RECORDER_CHANNELS } from '../protocol';

// The preload runs in a browser context, but this folder is type checked without the DOM library.
declare const window: {
  postMessage(message: unknown, targetOrigin: string, transfer: readonly unknown[]): void;
};

/**
 * The only door between the hidden recorder page and the main process. It passes commands in and
 * events out, and it hands the chunk ports to the page. It validates nothing: main checks every
 * event and the page is our own code. It exposes no other API.
 */
contextBridge.exposeInMainWorld('scrimRecorder', {
  onCommand(callback: (command: unknown) => void): void {
    ipcRenderer.on(RECORDER_CHANNELS.command, (_event, command: unknown) => {
      callback(command);
    });
  },
  sendEvent(event: unknown): void {
    ipcRenderer.send(RECORDER_CHANNELS.event, event);
  },
});

// Ports cannot cross the context bridge, so they are posted to the page as message ports.
ipcRenderer.on(RECORDER_CHANNELS.ports, (event, kinds: unknown) => {
  const ports: readonly unknown[] = event.ports;
  window.postMessage({ type: PORTS_MESSAGE_TYPE, kinds }, '*', ports);
});
