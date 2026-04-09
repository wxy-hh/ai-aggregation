const { FlatCompat } = require('@eslint/eslintrc');
const globals = require('globals');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.extends('next/core-web-vitals').map((config) => ({
    ...config,
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
  })),
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'off',
      '@next/next/no-assign-module-variable': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/alt-text': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
