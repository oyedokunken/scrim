import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  missingTargets,
  restoreTargets,
  signingTargets,
  stageTargets,
  targetsOf,
} from '../../build/signing-targets.mts';

const UNPACKED = [
  'Scrim.exe',
  'chrome_100_percent.pak',
  'ffmpeg.dll',
  'resources/app.asar',
  'resources/ffmpeg/ffmpeg.exe',
  'resources/ffmpeg/ffprobe.exe',
  'resources/ffmpeg/LICENSE.txt',
  'resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node',
  'resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-x64/uiohook-napi.node',
  'locales/en-US.pak',
];

describe('signingTargets', () => {
  it('picks the app program, the FFmpeg programs and the Windows mouse hook only', () => {
    expect(signingTargets(UNPACKED)).toEqual([
      'Scrim.exe',
      'resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node',
      'resources/ffmpeg/ffmpeg.exe',
      'resources/ffmpeg/ffprobe.exe',
    ]);
  });

  it('reads Windows separators', () => {
    expect(signingTargets(['Scrim.exe', 'resources\\ffmpeg\\ffmpeg.exe'])).toEqual([
      'Scrim.exe',
      'resources/ffmpeg/ffmpeg.exe',
    ]);
  });

  it('reports a folder that is not an unpacked app', () => {
    expect(missingTargets(signingTargets(UNPACKED))).toEqual([]);
    expect(missingTargets([])).toHaveLength(2);
    expect(missingTargets(['Scrim.exe'])).toEqual(['resources/ffmpeg/ffmpeg.exe']);
  });
});

describe('stage and restore', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function makeApp(): { root: string; app: string } {
    const root = mkdtempSync(join(tmpdir(), 'scrim-signing-'));
    roots.push(root);
    const app = join(root, 'win-unpacked');
    for (const file of UNPACKED) {
      mkdirSync(dirname(join(app, file)), { recursive: true });
      writeFileSync(join(app, file), `unsigned ${file}`);
    }
    return { root, app };
  }

  it('stages the targets with their folders and nothing else', () => {
    const { root, app } = makeApp();
    const staged = stageTargets(app, join(root, 'in'));
    expect(staged).toEqual(targetsOf(app));
    expect(readFileSync(join(root, 'in', 'resources/ffmpeg/ffmpeg.exe'), 'utf8')).toBe(
      'unsigned resources/ffmpeg/ffmpeg.exe',
    );
    expect(() => readFileSync(join(root, 'in', 'ffmpeg.dll'))).toThrow();
  });

  it('puts signed files back over the originals', () => {
    const { root, app } = makeApp();
    const staged = stageTargets(app, join(root, 'in'));
    for (const target of staged) writeFileSync(join(root, 'in', target), `signed ${target}`);
    restoreTargets(join(root, 'in'), app, { expectChanged: true });
    expect(readFileSync(join(app, 'Scrim.exe'), 'utf8')).toBe('signed Scrim.exe');
    expect(readFileSync(join(app, 'ffmpeg.dll'), 'utf8')).toBe('unsigned ffmpeg.dll');
  });

  it('refuses a signed set that came back unchanged, misses a file or adds one', () => {
    const { root, app } = makeApp();
    stageTargets(app, join(root, 'in'));
    expect(() => restoreTargets(join(root, 'in'), app, { expectChanged: true })).toThrow(
      /came back unsigned/,
    );
    rmSync(join(root, 'in', 'Scrim.exe'));
    expect(() => restoreTargets(join(root, 'in'), app)).toThrow(/missing: Scrim.exe/);
    writeFileSync(join(root, 'in', 'Scrim.exe'), 'x');
    writeFileSync(join(root, 'in', 'extra.exe'), 'x');
    expect(() => restoreTargets(join(root, 'in'), app)).toThrow(/not sent: extra.exe/);
  });

  it('refuses a folder that is not an unpacked app', () => {
    const root = mkdtempSync(join(tmpdir(), 'scrim-signing-'));
    roots.push(root);
    expect(() => targetsOf(root)).toThrow(/not an unpacked Scrim app/);
  });
});
