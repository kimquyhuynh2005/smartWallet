module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'test',
  testRegex: '[.]int-spec[.]ts$',
  setupFiles: ['<rootDir>/setup-env.ts'],
  testTimeout: 30000,
};
