module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-browser-env.js'],
  testMatch: ['**/*.test.js'],
  collectCoverage: false
};
