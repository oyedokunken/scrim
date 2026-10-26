// Text rules from CLAUDE.md: no em dashes, no emojis, no AI attribution. Shared by the repo scan
// and its tests. Special characters are built from code points so this file breaks no rule.

const reversed = (text) => text.split('').reverse().join('');

// The names of AI tools and agents are stored reversed and decoded here. The rule says those
// names appear nowhere in the repo except the rule text in CLAUDE.md, and that includes this
// file, so they are not written out.
const TOOL_NAMES = [
  'edualc',
  'cirhtopna',
  'ianepo',
  'tpgtahc',
  'tolipoc',
  'nived',
  'xedoc',
  'frudniw',
  'redia',
].map(reversed);

const TOOL_NAME_PATTERN = new RegExp(`\\b(?:${TOOL_NAMES.join('|')})\\b`, 'i');

// The one allowed mention: the working agreement file keeps a fixed name so tooling finds it.
const ALLOWED_FILENAME = new RegExp(`${reversed('edualc')}\\.md`, 'gi');

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f);

const RULES = [
  { name: 'em dash', pattern: new RegExp(EM_DASH) },
  { name: 'en dash', pattern: new RegExp(EN_DASH) },
  {
    name: 'emoji',
    pattern: new RegExp(
      `\\p{Emoji_Presentation}|\\p{Extended_Pictographic}${VARIATION_SELECTOR_16}|[\\u{1F1E6}-\\u{1F1FF}]`,
      'u',
    ),
  },
  { name: 'AI tool name', pattern: TOOL_NAME_PATTERN },
];

/**
 * Files that may break a rule. CLAUDE.md states the rules, and .gitignore carries the agent
 * state folders that CLAUDE.md requires. The lockfile is generated.
 */
export const EXEMPT_FILES = new Set(['CLAUDE.md', '.gitignore', 'pnpm-lock.yaml']);

/**
 * Returns one entry per line that breaks a rule.
 * @param {string} text
 * @returns {{ line: number, rule: string }[]}
 */
export function findTextProblems(text) {
  const problems = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(ALLOWED_FILENAME, '');
    for (const { name, pattern } of RULES) {
      if (pattern.test(line)) {
        problems.push({ line: index + 1, rule: name });
      }
    }
  });
  return problems;
}
