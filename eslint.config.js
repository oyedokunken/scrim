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
      '**/out/**',
      '**/release/**',
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
      '**/*.config.{js,ts,mjs,mts}',
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
  {
    // The desktop app never imports the website.
    files: ['apps/desktop/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/apps/landing/**', '@scrim/landing', '@scrim/landing/*'] }] },
      ],
    },
  },
  {
    // The renderer is untrusted web content: no Node, no Electron, nothing from main or preload.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...nodeBuiltins,
            {
              group: ['electron', 'electron/*'],
              message: 'The renderer talks to main through window.scrim.',
            },
            {
              group: ['**/main/*', '**/preload/*'],
              message: 'The renderer imports nothing from main or preload.',
            },
          ],
        },
      ],
    },
  },
  {
    // Main and preload run in Node. The browser globals do not exist there.
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'There is no window in the main or preload process.' },
        { name: 'document', message: 'There is no document in the main or preload process.' },
        { name: 'navigator', message: 'There is no navigator in the main or preload process.' },
      ],
    },
  },
  {
    // Every e2e test launches Electron through the isolated fixture.
    files: ['apps/desktop/tests/e2e/**/*.ts'],
    ignores: ['apps/desktop/tests/e2e/fixtures.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['_electron'],
              message: 'Use the fixture in tests/e2e/fixtures.ts so the launch is isolated.',
            },
          ],
        },
      ],
    },
  },
  {
    // The sandboxed preload imports only electron and types.
    files: ['apps/desktop/src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...nodeBuiltins,
            {
              group: ['**/main/*', '**/renderer/*'],
              message: 'Preload imports only electron and types.',
            },
            { regex: '^zod', message: 'Do not import zod in the sandboxed preload.' },
          ],
        },
      ],
    },
  },
  {
    // `shared` is environment neutral.
    files: ['apps/desktop/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...nodeBuiltins,
            {
              group: ['electron', 'electron/*', 'react', 'react-dom'],
              message: 'shared is environment neutral.',
            },
          ],
        },
      ],
    },
  },
  {
    // Every desktop window comes from createAppWindow, which applies the icon, the security
    // baseline and the taskbar rule. A plain BrowserWindow would skip all three.
    files: ['apps/desktop/src/main/**/*.ts'],
    ignores: ['apps/desktop/src/main/windows/create-window.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports. Default exports only where a framework requires them.',
        },
        {
          selector: "NewExpression[callee.name='BrowserWindow']",
          message: 'Create windows with createAppWindow so they get the icon and the baseline.',
        },
      ],
    },
  },
);
