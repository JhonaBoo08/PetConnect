const expoPreset = require("jest-expo/jest-preset");
const babelOptions = expoPreset.transform["\\.[jt]sx?$"][1];

module.exports = {
  preset: "jest-expo",
  transform: {
    ".*device-recovery\\.ts$": [
      "babel-jest",
      {
        ...babelOptions,
        plugins: [
          "@babel/plugin-transform-modules-commonjs",
          "@babel/plugin-transform-dynamic-import",
        ],
      },
    ],
    ...expoPreset.transform,
  },
  testMatch: ["**/__tests__/**/*.[jt]s?(x)"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/test/style-mock.cjs",
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
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
