import { describe, expect, it } from 'vitest';
import { SECURE_WEB_PREFERENCES } from '../../src/main/security';

describe('security baseline', () => {
  it('locks the web preferences', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchInlineSnapshot(`
      {
        "allowRunningInsecureContent": false,
        "contextIsolation": true,
        "nodeIntegration": false,
        "nodeIntegrationInSubFrames": false,
        "nodeIntegrationInWorker": false,
        "sandbox": true,
        "spellcheck": false,
        "webSecurity": true,
        "webviewTag": false,
      }
    `);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SECURE_WEB_PREFERENCES)).toBe(true);
  });
});
