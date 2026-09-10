const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'server/dist/**', 'coverage/**'],
  },
  {
    rules: {
      'import/no-unresolved': 'off',

      // Reanimated shared values are mutated through `.value` by design — that
      // is the library's entire API, and it is how the UI thread reads them.
      // The React Compiler rule cannot tell them apart from ordinary captured
      // objects, so it flags every animation in the app as an illegal mutation.
      // Disabled deliberately rather than suppressed line by line across a
      // dozen components.
      'react-hooks/immutability': 'off',
    },
  },
];
