import { describe, expect, it } from 'vitest';
import { findAttribution } from '../tools/commit-policy.js';

describe('commit attribution policy', () => {
  it('accepts a plain conventional commit', () => {
    expect(findAttribution('feat(core): clamp zoom center inside the frame')).toEqual([]);
  });

  it('accepts a body that mentions authors in prose', () => {
    expect(findAttribution('fix(landing): handle empty name\n\nReported by a visitor.')).toEqual(
      [],
    );
  });

  it.each([
    ['a co-author trailer', 'feat(core): add thing\n\nCo-Authored-By: Someone <a@example.com>'],
    ['a lower case co-author trailer', 'feat(core): add thing\n\nco-authored-by: x <x@y.z>'],
    ['a generated with line', 'feat(core): add thing\n\nGenerated with a tool'],
    [
      'a generated with link',
      'docs(repo): add notes\n\nCreated with [a tool](https://example.com)',
    ],
    ['the robot emoji', 'feat(core): add thing \u{1F916}'],
  ])('rejects %s', (_label, message) => {
    expect(findAttribution(message).length).toBeGreaterThan(0);
  });
});
