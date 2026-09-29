// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // §29: "Never use wall-clock time or unseeded randomness in domain logic
      // or tests." Randomness must always be seeded.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Randomness must be seeded (§29). Use a seeded PRNG, or crypto for ids.',
        },
      ],
    },
  },
  {
    // §29: packages/core is pure. No wall-clock time, no unseeded randomness, no I/O.
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/clock.ts', 'packages/core/src/ids.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'packages/core is pure: take a Clock instead of reading wall-clock time (§29).',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'packages/core is pure: take a Clock instead of reading wall-clock time (§29).',
        },
      ],
    },
  },
  {
    files: ['**/*.config.{ts,mts,js,mjs}', '**/tests/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
