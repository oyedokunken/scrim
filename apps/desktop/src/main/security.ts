import type { WebPreferences } from 'electron';

/**
 * Web preferences for every window Scrim creates. A unit test snapshots this
 * object, so any change shows up in review and needs an ADR.
 */
export const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
} as const satisfies WebPreferences);
