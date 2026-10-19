import js from '@eslint/js';
import globals from 'globals';

const shared = {
  ecmaVersion: 2023,
  sourceType: 'module',
};

export default [
  { ignores: ['node_modules/', 'public/assets/dist/', 'scripts/render/out/', 'data/'] },
  js.configs.recommended,
  {
    // server, build scripts, tests
    files: ['server.js', 'api/**/*.js', 'server/**/*.js', 'scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ...shared, globals: globals.node },
  },
  {
    // storefront and admin code runs in the browser
    files: ['public/assets/js/**/*.js', 'scripts/render/page/**/*.js'],
    languageOptions: { ...shared, globals: globals.browser },
  },
  {
    // the browser tests also contain callbacks that run inside the page they drive
    files: ['test/support/browser-suites.mjs'],
    languageOptions: { ...shared, globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-unused-vars': [
        'warn',
        // ignoreRestSiblings allows the `const { secret, ...safe } = obj` "omit a field" idiom
        { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
