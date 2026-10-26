import { findAttribution } from './tools/commit-policy.js';

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-attribution': (parsed) => {
          const problems = findAttribution(parsed.raw ?? '');
          return [problems.length === 0, problems.join('; ')];
        },
      },
    },
  ],
  rules: {
    'no-attribution': [2, 'always'],
    'scope-enum': [
      2,
      'always',
      ['desktop', 'landing', 'core', 'tokens', 'ci', 'deps', 'docs', 'repo'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    // Body and footer lines stay readable, but long URLs should not fail a commit.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
