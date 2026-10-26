import { describe, expect, it } from 'vitest';
import { EXEMPT_FILES, findTextProblems } from '../tools/text-rules.js';

// Everything special is built from code points, so this file breaks no rule it tests.
const char = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
const reversed = (text: string) => text.split('').reverse().join('');
const toolName = reversed('edualc');
const rules = (text: string) => findTextProblems(text).map((problem) => problem.rule);

const EM_DASH = char(0x2014);
const EN_DASH = char(0x2013);

describe('text rules', () => {
  it('accepts plain text, curly quotes, copyright signs, arrows and hyphens', () => {
    const text = `Who it${char(0x2019)}s for ${char(0xa9)} 2026 ${char(0x2191)} back to top - hyphen.`;
    expect(rules(text)).toEqual([]);
  });

  it('rejects an em dash', () => {
    expect(rules(`one ${EM_DASH} two`)).toEqual(['em dash']);
  });

  it('rejects an en dash, which covers ranges', () => {
    expect(rules(`pages 1${EN_DASH}5`)).toEqual(['en dash']);
  });

  it.each([
    ['a smiley', char(0x1f600)],
    ['a rocket', char(0x1f680)],
    ['a robot', char(0x1f916)],
    ['a flag', char(0x1f1f3, 0x1f1ec)],
    ['a heart with a variation selector', char(0x2764, 0xfe0f)],
  ])('rejects %s', (_label, emoji) => {
    expect(rules(`text ${emoji} text`)).toEqual(['emoji']);
  });

  it('rejects AI tool names in any case, as whole words', () => {
    expect(rules(`Made with ${toolName}`)).toEqual(['AI tool name']);
    expect(rules(toolName.toUpperCase())).toEqual(['AI tool name']);
    expect(rules(`${toolName} Code`)).toEqual(['AI tool name']);
  });

  it('does not flag a tool name inside another word', () => {
    expect(rules(`${toolName}ish`)).toEqual([]);
  });

  it('allows the working agreement filename and nothing else', () => {
    expect(rules(`Read ${toolName.toUpperCase()}.md first.`)).toEqual([]);
    expect(rules(`${toolName}.md and ${toolName} agree`)).toEqual(['AI tool name']);
  });

  it('reports the line number', () => {
    expect(findTextProblems(`ok\nfine\nbad ${EM_DASH} line`)).toEqual([
      { line: 3, rule: 'em dash' },
    ]);
  });

  it('exempts only the rules file, the ignore file and the lockfile', () => {
    expect([...EXEMPT_FILES].sort()).toEqual(['.gitignore', 'CLAUDE.md', 'pnpm-lock.yaml']);
  });
});
