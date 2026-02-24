// backend/jest.config.js
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.js"],
  setupFiles: ["<rootDir>/__tests__/setup.js"],
  collectCoverageFrom: [
    "utils/**/*.js",
    "controllers/**/*.js",
    "middleware/**/*.js",
    "services/**/*.js",
    "validators/**/*.js",
    "routes/**/*.js",
    "!**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    "./utils/": {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    "./middleware/": {
      branches: 75,
      functions: 100,
      lines: 90,
      statements: 90,
    },
  },
  verbose: true,
};
