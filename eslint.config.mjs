import js from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Biome owns formatting; ESLint adds Obsidian contracts and type-aware rules.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'coverage/**', 'main.js'],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { project: './tsconfig.json' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'always'],
      'no-debugger': 'error',
      'no-else-return': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Notice']",
          message: 'Use notify(...) from src/logging.ts for user-visible messages.',
        },
      ],
    },
  },
  {
    files: ['src/logging.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The stub implements the helpers that the production rule asks callers to use.
    files: ['tests/stubs/**/*.ts'],
    rules: { 'obsidianmd/prefer-create-el': 'off' },
  },
  {
    // Host-side maintenance tests do not ship in the mobile plugin bundle.
    files: ['tests/scripts/**/*.ts'],
    rules: { 'obsidianmd/no-nodejs-modules': 'off' },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'describe', property: 'only', message: 'Do not commit describe.only()' },
        { object: 'it', property: 'only', message: 'Do not commit it.only()' },
        { object: 'test', property: 'only', message: 'Do not commit test.only()' },
      ],
    },
  },
);
