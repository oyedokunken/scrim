import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkUpdateInfo, refreshUpdateInfo } from '../../scripts/refresh-update-info.mts';

describe('the update file for the final installer', () => {
  const NAME = 'Scrim-Setup-1.2.0.exe';
  const WITH_BLOCKMAP = [
    'version: 1.2.0',
    'files:',
    `  - url: ${NAME}`,
    '    sha512: OLD',
    '    size: 100',
    '    blockMapSize: 55',
    `path: ${NAME}`,
    'sha512: OLD',
    "releaseDate: '2026-10-30T10:00:00.000Z'",
  ].join('\n');

  const sha = (bytes: Uint8Array): string => createHash('sha512').update(bytes).digest('base64');

  it('matches the signed installer bytes in hash and size after a refresh', () => {
    const unsigned = Buffer.from('unsigned installer');
    const signed = Buffer.from('unsigned installer plus a signature block');
    const yml = refreshUpdateInfo(WITH_BLOCKMAP, NAME, sha(signed), signed.length);
    expect(yml).toContain(`sha512: ${sha(signed)}`);
    expect(yml).toContain(`size: ${String(signed.length)}`);
    expect(checkUpdateInfo(yml, NAME, signed)).toEqual([]);
    // The file written for the unsigned installer must not pass for the signed one.
    const stale = refreshUpdateInfo(WITH_BLOCKMAP, NAME, sha(unsigned), unsigned.length);
    const problems = checkUpdateInfo(stale, NAME, signed).join(' ');
    expect(problems).toContain('not the installer hash');
    expect(problems).toContain('size');
  });

  it('drops the blockMapSize that pointed at the unsigned blockmap', () => {
    const bytes = Buffer.from('x');
    const yml = refreshUpdateInfo(WITH_BLOCKMAP, NAME, sha(bytes), 1);
    expect(yml).not.toContain('blockMapSize');
    expect(checkUpdateInfo(WITH_BLOCKMAP, NAME, bytes).join(' ')).toContain('blockMapSize');
  });

  it('works on real files, as the release workflow runs it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scrim-update-'));
    try {
      const installer = join(dir, NAME);
      const update = join(dir, 'latest.yml');
      writeFileSync(installer, Buffer.from('signed bytes'));
      writeFileSync(update, WITH_BLOCKMAP);
      const script = fileURLToPath(
        new URL('../../scripts/refresh-update-info.mts', import.meta.url),
      );
      const run = (...args: string[]) =>
        spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
      expect(run('--check', installer, update).status).toBe(1);
      expect(run(installer, update).status).toBe(0);
      expect(run('--check', installer, update).status).toBe(0);
      expect(readFileSync(update, 'utf8')).toContain(`sha512: ${sha(readFileSync(installer))}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a wrong file name and a missing entry', () => {
    const bytes = Buffer.from('x');
    expect(checkUpdateInfo('version: 1\n', NAME, bytes).join(' ')).toContain('no files entry');
    const yml = refreshUpdateInfo(WITH_BLOCKMAP, NAME, sha(bytes), 1);
    expect(checkUpdateInfo(yml, 'Other.exe', bytes).join(' ')).toContain('expected Other.exe');
  });
});

const YML = [
  'version: 1.2.0',
  'files:',
  '  - url: Scrim-Setup-1.2.0.exe',
  '    sha512: OLD',
  '    size: 100',
  'path: Scrim-Setup-1.2.0.exe',
  'sha512: OLD',
  "releaseDate: '2026-10-30T10:00:00.000Z'",
].join('\n');

describe('refreshUpdateInfo', () => {
  it('writes the real hash and size of the signed file, in the entry and at the top', () => {
    const out = refreshUpdateInfo(YML, 'Scrim-Setup-1.2.0.exe', 'NEW', 250);
    expect(out).toContain('    sha512: NEW\n    size: 250');
    expect(out).toContain('path: Scrim-Setup-1.2.0.exe\nsha512: NEW');
    expect(out).not.toContain('OLD');
    expect(out).toContain('version: 1.2.0');
    expect(out).toContain("releaseDate: '2026-10-30T10:00:00.000Z'");
  });

  it('leaves entries for other files alone', () => {
    const yml = `${YML.split('\n').slice(0, 5).join('\n')}\n  - url: other.exe\n    sha512: KEEP\n    size: 9\n${YML.split('\n').slice(5).join('\n')}`;
    const out = refreshUpdateInfo(yml, 'Scrim-Setup-1.2.0.exe', 'NEW', 250);
    expect(out).toContain('url: other.exe\n    sha512: KEEP\n    size: 9');
  });
});
