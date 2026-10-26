// The no attribution rule from CLAUDE.md, shared by commitlint and the CI check.
// It matches the shape of attribution, not tool names, so no tool is named here.

const FORBIDDEN = [
  {
    // Any co-author trailer. Squash merges credit authors through GitHub instead.
    pattern: /^\s*co-authored-by\s*:/im,
    reason: 'co-author trailers are not allowed',
  },
  {
    pattern:
      /\b(?:generated|created|written|authored|made)\s+(?:with|by|using)\b[^\n]*(?:\]\(|https?:\/\/)/i,
    reason: 'generated with lines are not allowed',
  },
  {
    pattern: /^\s*generated\s+(?:with|by)\b/im,
    reason: 'generated with lines are not allowed',
  },
  {
    // Robot face emoji, U+1F916.
    pattern: /\u{1F916}/u,
    reason: 'the robot emoji is not allowed',
  },
];

/**
 * Returns the reasons a text breaks the no attribution rule. An empty array means it is clean.
 * @param {string} text
 * @returns {string[]}
 */
export function findAttribution(text) {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ reason }) => reason);
}
