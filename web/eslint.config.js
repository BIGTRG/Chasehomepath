import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        navigator: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
      'no-undef': 'error',
    },
  },
  {
    // Service worker runs in a worker global scope, not the window.
    files: ['public/sw.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', URL: 'readonly', fetch: 'readonly', console: 'readonly' } },
  },
];
