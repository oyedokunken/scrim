import { contextBridge } from 'electron';

// The typed bridge grows channel by channel in M4. For now it only reports the platform.
contextBridge.exposeInMainWorld('scrim', { platform: process.platform });
