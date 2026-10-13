/** @type {import('ts-jest').JestConfigWithTsJest} */
// `npm run test:integration`: group order flows against a real MongoDB (mongodb-memory-server).
module.exports = {
  ...require('./jest.config'),
  testMatch: ['**/src/**/*.integration.ts'],
  testTimeout: 60000,
};
