import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nodeBuiltins = [
  { group: ['node:*'], message: 'This code must run outside Node.' },
  { group: ['fs', 'path', 'os', 'crypto', 'child_process', 'http', 'https', 'net', 'stream'] },
];

const desktopPattern = {
  group: ['**/apps/desktop/**', '@scrim/desktop', '@scrim/desktop/*'],
  message: 'The website and the desktop app never import each other.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.lighthouseci/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/landing/src/generated/**',
      'apps/landing/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', 'tools/*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports. Default exports only where a framework requires them.',
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Framework entry points that must use a default export.
    files: [
      '**/*.config.{js,ts,mjs}',
      'apps/landing/src/app/**/{page,layout,error,not-found,loading,opengraph-image,twitter-image,apple-icon,manifest,robots,sitemap}.{ts,tsx}',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Tests may use non null assertions. The rule is for production code.
    files: ['**/tests/**', '**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // packages/core is pure: no React, no Node, no Electron, no DOM.
    files: ['packages/core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...nodeBuiltins,
            {
              group: ['react', 'react-dom', 'react/*', 'next', 'next/*'],
              message: 'core is pure.',
            },
            { group: ['electron', 'electron/*'], message: 'core is pure.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'process',
        'Buffer',
        'localStorage',
      ],
    },
  },
  {
    // packages/tokens has no runtime dependencies.
    files: ['packages/tokens/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^[^.]', message: 'tokens has no runtime dependencies.' }] },
      ],
    },
  },
  {
    // The website and the desktop app never import each other.
    files: ['apps/landing/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [desktopPattern] }] },
  },
  {
    // Shared landing code has no Node, database or mail imports and never reaches server code.
    // A later block replaces the rule for a file, so the desktop pattern is repeated here.
    files: ['apps/landing/src/lib/**/*.{ts,tsx}', 'apps/landing/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            desktopPattern,
            ...nodeBuiltins,
            { group: ['server-only'], message: 'Only src/server may import server-only.' },
            {
              group: ['@/server', '@/server/*', '**/server/*'],
              message: 'Client reachable code must not import src/server.',
            },
            { group: ['nodemailer', '@prisma/*', '**/generated/prisma*', 'pg'] },
          ],
        },
      ],
    },
  },
);
