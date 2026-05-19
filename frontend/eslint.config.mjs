import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const globals = Object.fromEntries(
  [
    'Blob',
    'CSSStyleSheet',
    'CustomEvent',
    'Event',
    'File',
    'FormData',
    'Headers',
    'HTMLElement',
    'MutationObserver',
    'Node',
    'Request',
    'Response',
    'URL',
    'URLSearchParams',
    'atob',
    'btoa',
    'chrome',
    'clearInterval',
    'clearTimeout',
    'console',
    'crypto',
    'document',
    'fetch',
    'localStorage',
    'navigator',
    'sessionStorage',
    'setInterval',
    'setTimeout',
    'window',
  ].map((name) => [name, 'readonly']),
);

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.timestamp-*.mjs',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.config.ts'],
    languageOptions: {
      globals: {
        ...globals,
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
];
