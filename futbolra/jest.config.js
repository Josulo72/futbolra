module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'public/src/**/*.js',
    '!public/src/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};