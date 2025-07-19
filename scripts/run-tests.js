#!/usr/bin/env node

/**
 * Script to run the comprehensive test suite for VSX Remote SSH Extension
 * 
 * This script runs all tests and generates a report for the extension.
 * It's used as part of the release process to ensure the extension is ready for distribution.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Create reports directory if it doesn't exist
const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Run the test runner
console.log('Running VSX Remote SSH Extension comprehensive test suite...');
console.log('=============================================================');

// Run unit tests first
console.log('\nRunning unit tests...');
const unitTestResult = spawnSync('npx', ['vitest', 'run', 'src', '--reporter=verbose'], {
  stdio: 'inherit'
});

if (unitTestResult.status !== 0) {
  console.error('Unit tests failed. Aborting test run.');
  process.exit(unitTestResult.status);
}

// Run integration tests
console.log('\nRunning integration tests...');
const integrationTestResult = spawnSync('npx', ['ts-node', path.join(__dirname, '../tests/integration/test-runner.ts')], {
  stdio: 'inherit'
});

// Generate final report
const reportPath = path.join(reportsDir, `test-report-${new Date().toISOString().replace(/:/g, '-')}.txt`);
const report = `
VSX Remote SSH Extension Test Report
===================================

Date: ${new Date().toISOString()}

Unit Tests: ${unitTestResult.status === 0 ? 'PASSED' : 'FAILED'}
Integration Tests: ${integrationTestResult.status === 0 ? 'PASSED' : 'FAILED'}

Overall Status: ${unitTestResult.status === 0 && integrationTestResult.status === 0 ? 'PASSED' : 'FAILED'}

This report was generated as part of the release process.
`;

fs.writeFileSync(reportPath, report);
console.log(`\nTest report written to: ${reportPath}`);

// Exit with appropriate status code
const exitCode = unitTestResult.status !== 0 ? unitTestResult.status : integrationTestResult.status;
process.exit(exitCode);