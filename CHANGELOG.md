# Change Log

All notable changes to the SSH Remote Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2025-07-19

### Fixed

- Fixed module system compatibility issue by changing from ES modules to CommonJS
- Updated import/export syntax in extension.ts and error-classifier.ts files
- Resolved extension activation errors related to module loading
- Improved compatibility with VS Code's extension host

## [1.0.4] - 2025-07-19

### Added

- Initial release of SSH Remote Extension
- SSH connection management with multiple authentication methods (password, SSH key)
- Remote file system integration with VS Code
- Remote terminal support with multiple sessions
- Configuration management and secure credential storage
- File system caching for improved performance
- Connection state management and auto-reconnection
- Error classification and user-friendly error messages
- Performance monitoring with latency and memory tracking
- Workspace context management for saved workspaces
- Command palette integration with comprehensive commands
- Status bar integration showing connection status
- Host configuration UI for easy setup
- Secure storage for sensitive credentials
- File system provider with watch capabilities
- Terminal session management
- Reconnection handler with exponential backoff
- Error classifier with troubleshooting steps
- File system cache manager
- Performance monitor with real-time metrics

### Features

- **Secure SSH Connections**: Support for password and SSH key authentication
- **Remote File System**: Full file browsing, editing, and management on remote servers
- **Integrated Terminal**: SSH terminal with command history and multiple sessions
- **Performance Monitoring**: Real-time performance metrics and resource monitoring
- **Workspace Management**: Save and switch between remote workspace contexts
- **Connection Management**: Multiple host support with connection pooling
- **Error Handling**: Comprehensive error classification and user guidance
- **Caching**: Smart file caching for improved performance
- **Auto-reconnection**: Automatic recovery from network interruptions

### Technical Details

- Built with TypeScript and VS Code Extension API
- Uses ssh2 library for SSH connections
- Implements ssh2-sftp-client for file operations
- Comprehensive test suite with 177 passing tests
- Full linting compliance with ESLint
- Modular architecture with clear separation of concerns
- Secure credential storage using VS Code's secure storage API
- Performance monitoring with real-time metrics
- File system caching with intelligent cache management

### Commands Available

- `Remote SSH: Add SSH Host` - Add new SSH host configuration
- `Remote SSH: Connect to Host via SSH` - Connect to configured host
- `Remote SSH: Disconnect` - Disconnect from current host
- `Remote SSH: Reconnect` - Reconnect to current host
- `Remote SSH: Open Remote Terminal` - Open SSH terminal
- `Remote SSH: Open Remote Workspace` - Open workspace on remote host
- `Remote SSH: Show Active Connections` - View active SSH connections
- `Remote SSH: Manage SSH Hosts` - Manage host configurations
- `Remote SSH: Test Connection` - Test SSH connection
- `Remote SSH: Show Host Information` - Display host details
- `Remote SSH: Show Cache Statistics` - View cache performance
- `Remote SSH: Clear Cache` - Clear file system cache
- `Remote SSH: Export Configuration` - Export host configurations
- `Remote SSH: Import Configuration` - Import host configurations

---

## Version History

- **1.0.0**: Initial production-ready release with full feature set

## Migration Guide

This is the initial release, so no migration is required.

## Support

For questions about the extension or to report issues, please:

- Check the [documentation](https://github.com/jajera/vsx-remote-ssh/wiki)
- Open an [issue](https://github.com/jajera/vsx-remote-ssh/issues)
- Join the [discussions](https://github.com/jajera/vsx-remote-ssh/discussions)
