module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(test).ts?(x)'],
  // The backend is a separate package with its own runner (Vitest) — it is a
  // Node service, not a React Native app, and does not belong under jest-expo.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@gorhom/.*|react-native-reanimated|react-native-worklets)',
  ],
  collectCoverageFrom: ['src/core/**/*.ts', 'src/data/**/*.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
