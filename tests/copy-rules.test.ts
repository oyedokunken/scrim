import { describe, expect, it } from 'vitest';
import { ALLOW_MARKER, BANNED_PHRASES, findCopyProblems, isScanned } from '../tools/copy-rules.js';

describe('copy rules', () => {
  it.each(BANNED_PHRASES)('flags "%s", in any case', (phrase) => {
    expect(findCopyProblems(`Text ${phrase.toUpperCase()} text`)).toEqual([{ line: 1, phrase }]);
  });

  it('reports the line number', () => {
    expect(findCopyProblems('fine\nfine\nComing soon for Mac')).toEqual([
      { line: 3, phrase: 'coming soon' },
    ]);
  });

  it('accepts present tense copy', () => {
    expect(findCopyProblems('Scrim zooms in where you click. Download it for Windows.')).toEqual(
      [],
    );
  });

  it('honors the marker on the same line or the line before', () => {
    expect(findCopyProblems(`a coming soon page ${ALLOW_MARKER}: quoting the old copy`)).toEqual(
      [],
    );
    expect(findCopyProblems(`${ALLOW_MARKER}: history\nthe first release`)).toEqual([]);
    expect(findCopyProblems(`${ALLOW_MARKER}\nfine\nthe first release`)).toHaveLength(1);
  });

  it('scans the landing source, readme, changelog and docs only, never generated code', () => {
    expect(isScanned('apps/landing/src/lib/faq.ts')).toBe(true);
    expect(isScanned('README.md')).toBe(true);
    expect(isScanned('CHANGELOG.md')).toBe(true);
    expect(isScanned('docs/releasing.md')).toBe(true);
    expect(isScanned('apps/landing/src/generated/prisma/client.ts')).toBe(false);
    expect(isScanned('apps/desktop/src/main/index.ts')).toBe(false);
    expect(isScanned('apps/landing\\src\\lib\\faq.ts')).toBe(true);
  });
});
