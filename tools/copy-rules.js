// Phrases that make the site and docs sound unreleased. Scrim speaks as released.
// A line can opt out with the marker below on the same line or the line before, with a reason.
export const ALLOW_MARKER = 'copy-guard: allow';

export const BANNED_PHRASES = [
  'coming soon',
  'coming to',
  'not out yet',
  "isn't out",
  'isn’t out',
  'not yet released',
  'remind me when',
  'first release',
  'windows first',
  'will follow',
  'will be released',
  'will be available',
  'in development',
  'under development',
  'work in progress',
];

/** Paths scanned, as prefixes or exact names, relative to the repository root. */
export const SCANNED = ['apps/landing/src/', 'README.md', 'CHANGELOG.md', 'docs/'];
/** Generated code is never scanned. */
export const SKIPPED = ['apps/landing/src/generated/'];

export function isScanned(file) {
  const path = file.replaceAll('\\', '/');
  return (
    SCANNED.some((entry) => path === entry || (entry.endsWith('/') && path.startsWith(entry))) &&
    !SKIPPED.some((entry) => path.startsWith(entry))
  );
}

/** Returns one problem per banned phrase found, case insensitive, with its 1 based line. */
export function findCopyProblems(text) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const previous = index > 0 ? (lines[index - 1] ?? '') : '';
    if (line.includes(ALLOW_MARKER) || previous.includes(ALLOW_MARKER)) {
      return;
    }
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        problems.push({ line: index + 1, phrase });
      }
    }
  });
  return problems;
}
