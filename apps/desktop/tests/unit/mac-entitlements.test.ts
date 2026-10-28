import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const plist = readFileSync(join(__dirname, '../../build/entitlements.mac.plist'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

describe('macOS entitlements', () => {
  it.each([
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.device.audio-input',
    'com.apple.security.device.camera',
  ])('grants %s', (key) => {
    expect(plist).toContain(`<key>${key}</key>\n    <true/>`);
  });

  it('does not ask for more than it needs', () => {
    expect(plist).not.toContain('app-sandbox');
    expect(plist).not.toContain('allow-dyld-environment-variables');
    expect(plist).not.toContain('network.client');
  });
});
