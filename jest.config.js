/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        esModuleInterop: true,
      },
    }],
  },
  testMatch: ['**/src/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
};
