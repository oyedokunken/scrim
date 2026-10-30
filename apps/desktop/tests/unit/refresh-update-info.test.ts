import { describe, expect, it } from 'vitest';
import { refreshUpdateInfo } from '../../scripts/refresh-update-info.mts';

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
