import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', '.data/**', 'coverage/**', 'next-env.d.ts', 'lib/db/migrations/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The academic engine is the source of truth for every academic fact. It
    // must stay pure data-in/data-out so it runs identically on the server, in
    // the browser, and in tests: no packages, no framework, no I/O.
    files: ['lib/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^.]',
              message: 'lib/engine may only import relative paths. Keep the engine pure: no packages, no I/O.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The engine does no I/O.' },
        { name: 'Date', message: 'The engine has no clock. Pass time in as data.' },
        { name: 'localStorage', message: 'The engine does no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine is deterministic. No randomness.' },
        { object: 'Date', property: 'now', message: 'The engine has no clock. Pass time in as data.' },
      ],
    },
  },
]

export default config
