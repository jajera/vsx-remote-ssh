# VSX Remote SSH Extension Test Suite

This directory contains the comprehensive test suite for the VSX Remote SSH extension. The test suite is designed to verify all aspects of the extension's functionality, including connection management, file system operations, terminal handling, security, and performance.

## Test Structure

The test suite is organized into the following categories:

### Unit Tests

Located in the `src` directory alongside the implementation files, these tests verify the behavior of individual components in isolation.

### Integration Tests

Located in the `tests/integration` directory, these tests verify the interaction between multiple components and simulate real-world usage scenarios.

- **Mock SSH Server Tests** (`mock-ssh-server.test.ts`): Tests for the mock SSH server implementation used for testing.
- **Connection Manager Tests** (`connection-manager.test.ts`): Tests for SSH connection establishment, authentication, and management.
- **File System Provider Tests** (`file-system-provider.test.ts`): Tests for remote file system operations via SFTP.
- **Multi-Connection Tests** (`multi-connection.test.ts`): Tests for handling multiple simultaneous SSH connections.
- **Performance Tests** (`performance.test.ts`): Tests for performance monitoring and optimization.
- **Security Tests** (`security.test.ts`): Tests for secure credential handling and SSH protocol usage.

## Running Tests

The following npm scripts are available for running tests:

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run security tests only
npm run test:security

# Run performance tests only
npm run test:performance

# Run the comprehensive test suite
npm run test:all
```

The comprehensive test suite (`test:all`) runs all tests and generates a detailed report with test results and statistics.

## Test Runner

The `test-runner.ts` file in the `tests/integration` directory provides a centralized way to run all integration tests and generate a comprehensive test report. It can be run directly using:

```bash
npx ts-node tests/integration/test-runner.ts
```

The test runner will:

1. Run each test category sequentially
2. Collect test results and statistics
3. Generate a detailed report with test results
4. Display a summary of test results

## Mock SSH Server

The integration tests use a mock SSH server (`mock-ssh-server.ts`) that simulates an SSH server for testing purposes. This allows testing SSH client functionality without requiring an actual SSH server.

The mock server provides:

- Authentication with password and public key
- File system operations via SFTP
- Terminal sessions
- Command execution

## Adding New Tests

When adding new tests:

1. For unit tests, create a `.test.ts` file alongside the implementation file
2. For integration tests, add a new test file in the `tests/integration` directory
3. Update the `TEST_CATEGORIES` array in `test-runner.ts` if adding a new test category

## Test Coverage

The test suite aims to provide comprehensive coverage of all extension functionality, including:

- SSH connection establishment and authentication
- Connection state management and persistence
- Automatic reconnection and error handling
- Remote file system operations (read, write, create, delete, rename)
- File system caching and performance optimization
- Terminal session management
- Configuration management and security
- Multi-connection handling
- Performance monitoring
- Error handling and user experience

## Continuous Integration

The test suite is designed to be run in a CI environment. The `test:all` script can be used in CI workflows to run the comprehensive test suite and generate a report.
