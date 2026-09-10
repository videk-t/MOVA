const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // The backend is a separate package. Linting a Node service with Expo's
    // rules is a category error — `no-dynamic-env-var` exists because Expo
    // inlines env vars into the app bundle, which is not how a server reads
    // its configuration.
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'server/**', 'coverage/**'],
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
