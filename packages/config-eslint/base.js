const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/.next/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-control-regex': 'off',
      'no-empty': 'off',
      'no-empty-pattern': 'off',
      'require-yield': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettier,
];
