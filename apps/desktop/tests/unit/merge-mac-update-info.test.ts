import { describe, expect, it } from 'vitest';
import { mergeMacUpdateInfo } from '../../scripts/merge-mac-update-info.mts';

const file = (arch: string, date: string, version = '1.2.0') =>
  [
    `version: ${version}`,
    'files:',
    `  - url: Scrim-${version}-mac-${arch}.zip`,
    `    sha512: zip-${arch}`,
    '    size: 100',
    `  - url: Scrim-${version}-mac-${arch}.dmg`,
    `    sha512: dmg-${arch}`,
    '    size: 200',
    `path: Scrim-${version}-mac-${arch}.zip`,
    `sha512: zip-${arch}`,
    `releaseDate: '${date}'`,
    '',
  ].join('\n');

describe('merging the two Mac update files', () => {
  const merged = mergeMacUpdateInfo([
    file('arm64', '2026-10-30T10:00:00.000Z'),
    file('x64', '2026-10-30T10:05:00.000Z'),
  ]);

  it('lists the files of both architectures once', () => {
    for (const name of [
      'Scrim-1.2.0-mac-arm64.zip',
      'Scrim-1.2.0-mac-arm64.dmg',
      'Scrim-1.2.0-mac-x64.zip',
      'Scrim-1.2.0-mac-x64.dmg',
    ]) {
      expect(merged.split(name).length - 1).toBeGreaterThanOrEqual(1);
      expect(merged).toContain(`  - url: ${name}`);
    }
    expect(merged.match(/^ {2}- url:/gm)).toHaveLength(4);
  });

  it('keeps each file with its own checksum and size', () => {
    expect(merged).toContain(
      '  - url: Scrim-1.2.0-mac-x64.zip\n    sha512: zip-x64\n    size: 100',
    );
  });

  it('uses the version, the first legacy path and the latest release date', () => {
    expect(merged.startsWith('version: 1.2.0\nfiles:\n')).toBe(true);
    expect(merged).toContain('\npath: Scrim-1.2.0-mac-arm64.zip\n');
    expect(merged).toContain("releaseDate: '2026-10-30T10:05:00.000Z'");
  });

  it('is stable when merged again with the same input', () => {
    expect(mergeMacUpdateInfo([merged, merged])).toBe(merged);
  });

  it('refuses builds of different versions, and files that are not update files', () => {
    expect(() => mergeMacUpdateInfo([file('arm64', 'a'), file('x64', 'b', '1.3.0')])).toThrow(
      /disagree/,
    );
    expect(() => mergeMacUpdateInfo(['nothing here'])).toThrow();
    expect(() => mergeMacUpdateInfo([])).toThrow();
  });
});
