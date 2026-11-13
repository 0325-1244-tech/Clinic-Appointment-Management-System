// @ts-check
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'data/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-coercion': 'error',
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
  { files: ['server.js', 'src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.config.js'], languageOptions: { globals: globals.node } },
  { files: ['public/**/*.js', 'src/domain/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['test/e2e/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
