// One process, no workers. With workers, Jest intermittently reports one
// that "failed to exit gracefully"; --detectOpenHandles finds nothing open,
// and it never happens in band, so it looks like a worker holding the whole
// of aws-cdk-lib taking too long to shut down. A suite this small gains
// nothing from parallelism. Revisit if it grows.
module.exports = {
  maxWorkers: 1,
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest'],
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
}
