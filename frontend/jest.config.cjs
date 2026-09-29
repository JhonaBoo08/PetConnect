module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.[jt]s?(x)"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/test/style-mock.cjs",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|expo-router/.*|react-native-svg))",
  ],
  collectCoverageFrom: [
    "src/services/**/*.{ts,tsx}",
    "src/app/**/*.{ts,tsx}",
    "!src/app/**/_layout.tsx",
  ],
};
