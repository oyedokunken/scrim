import { FuseV1Options } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { diffFuses, FUSES, parseFuseReport, toFlipConfig } from '../../build/fuses.mts';

const REPORT = `Analyzing app: Scrim.exe
Fuse Version: v1
  RunAsNode is Disabled
  EnableCookieEncryption is Enabled
  EnableNodeOptionsEnvironmentVariable is Disabled
  EnableNodeCliInspectArguments is Disabled
  EnableEmbeddedAsarIntegrityValidation is Enabled
  OnlyLoadAppFromAsar is Enabled
  LoadBrowserProcessSpecificV8Snapshot is Disabled
  GrantFileProtocolExtraPrivileges is Disabled
  WasmTrapHandlers is Enabled
`;

describe('fuse baseline', () => {
  it('locks the fuse values', () => {
    expect(FUSES).toMatchInlineSnapshot(`
      {
        "EnableCookieEncryption": true,
        "EnableEmbeddedAsarIntegrityValidation": true,
        "EnableNodeCliInspectArguments": false,
        "EnableNodeOptionsEnvironmentVariable": false,
        "GrantFileProtocolExtraPrivileges": false,
        "OnlyLoadAppFromAsar": true,
        "RunAsNode": false,
      }
    `);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FUSES)).toBe(true);
  });

  it('turns the plan fuses into flip options', () => {
    const config = toFlipConfig();
    expect(config[FuseV1Options.RunAsNode]).toBe(false);
    expect(config[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(false);
    expect(config[FuseV1Options.EnableNodeCliInspectArguments]).toBe(false);
    expect(config[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(true);
    expect(config[FuseV1Options.OnlyLoadAppFromAsar]).toBe(true);
    expect(config[FuseV1Options.EnableCookieEncryption]).toBe(true);
  });
});

describe('fuse verification', () => {
  it('parses the read output', () => {
    expect(parseFuseReport(REPORT)).toMatchObject({ RunAsNode: false, OnlyLoadAppFromAsar: true });
  });

  it('accepts a matching binary', () => {
    expect(diffFuses(parseFuseReport(REPORT))).toEqual([]);
  });

  it('names every fuse that differs', () => {
    const wrong = REPORT.replace('RunAsNode is Disabled', 'RunAsNode is Enabled').replace(
      'OnlyLoadAppFromAsar is Enabled',
      'OnlyLoadAppFromAsar is Disabled',
    );
    expect(diffFuses(parseFuseReport(wrong))).toEqual([
      'RunAsNode: expected disabled, found enabled',
      'OnlyLoadAppFromAsar: expected enabled, found disabled',
    ]);
  });

  it('fails when a fuse is missing from the report', () => {
    expect(diffFuses({})).toHaveLength(Object.keys(FUSES).length);
  });
});
