/**
 * Comprehensive Test Runner for VSX Remote SSH Extension
 * 
 * This module provides a centralized way to run all integration tests
 * and generate a comprehensive test report.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test categories
const TEST_CATEGORIES = [
  {
    name: 'Mock SSH Server',
    file: 'mock-ssh-server.test.ts',
    description: 'Tests for the mock SSH server implementation'
  },
  {
    name: 'Connection Manager',
    file: 'connection-manager.test.ts',
    description: 'Tests for SSH connection establishment and management'
  },
  {
    name: 'File System Provider',
    file: 'file-system-provider.test.ts',
    description: 'Tests for remote file system operations'
  },
  {
    name: 'Multi-Connection',
    file: 'multi-connection.test.ts',
    description: 'Tests for handling multiple simultaneous SSH connections'
  },
  {
    name: 'Performance',
    file: 'performance.test.ts',
    description: 'Tests for performance monitoring and optimization'
  },
  {
    name: 'Security',
    file: 'security.test.ts',
    description: 'Tests for secure credential handling and SSH protocol usage'
  },
  {
    name: 'Release Readiness',
    file: 'release-readiness.test.ts',
    description: 'Tests to verify the extension is ready for release'
  }
];

/**
 * Run a specific test file
 */
function runTest(testFile: string): { success: boolean; output: string } {
  console.log(`Running test: ${testFile}`);
  
  const testPath = path.join(__dirname, testFile);
  const result = spawnSync('npx', ['vitest', 'run', testPath, '--reporter=verbose'], {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  return {
    success: result.status === 0,
    output: result.stdout + result.stderr
  };
}

/**
 * Run all tests and generate a report
 */
function runAllTests(): void {
  console.log('Starting comprehensive test suite for VSX Remote SSH Extension');
  console.log('=============================================================');
  
  const results: { category: string; success: boolean; output: string }[] = [];
  let totalTests = 0;
  let passedTests = 0;
  
  // Run each test category
  for (const category of TEST_CATEGORIES) {
    console.log(`\nRunning ${category.name} tests...`);
    const result = runTest(category.file);
    
    results.push({
      category: category.name,
      success: result.success,
      output: result.output
    });
    
    // Extract test counts from output
    const testCountMatch = result.output.match(/(\d+)\s+passed/);
    if (testCountMatch) {
      const count = parseInt(testCountMatch[1], 10);
      totalTests += count;
      if (result.success) {
        passedTests += count;
      }
    }
    
    console.log(`${category.name} tests ${result.success ? 'PASSED' : 'FAILED'}`);
  }
  
  // Generate report
  const reportPath = path.join(os.tmpdir(), `vsx-remote-ssh-test-report-${Date.now()}.txt`);
  let report = 'VSX Remote SSH Extension Test Report\n';
  report += '=====================================\n\n';
  report += `Date: ${new Date().toISOString()}\n`;
  report += `Total Tests: ${totalTests}\n`;
  report += `Passed Tests: ${passedTests}\n`;
  report += `Success Rate: ${Math.round((passedTests / totalTests) * 100)}%\n\n`;
  
  report += 'Test Categories:\n';
  report += '---------------\n\n';
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const category = TEST_CATEGORIES[i];
    
    report += `${category.name} (${result.success ? 'PASSED' : 'FAILED'})\n`;
    report += `Description: ${category.description}\n`;
    report += `File: ${category.file}\n\n`;
    
    // Include detailed output for failed tests
    if (!result.success) {
      report += 'Detailed Output:\n';
      report += '---------------\n';
      report += result.output;
      report += '\n\n';
    }
  }
  
  fs.writeFileSync(reportPath, report);
  
  console.log('\n=============================================================');
  console.log(`Test report generated at: ${reportPath}`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed Tests: ${passedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('=============================================================');
}

// Run the tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

export { runAllTests, runTest };