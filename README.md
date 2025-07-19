# VSX Remote SSH Extension

[![CI](https://github.com/jajera/vsx-remote-ssh/actions/workflows/ci.yml/badge.svg)](https://github.com/jajera/vsx-remote-ssh/actions/workflows/ci.yml)

[![Release to Open VSX Registry](https://github.com/jajera/vsx-remote-ssh/actions/workflows/publish-open-vsx.yml/badge.svg)](https://github.com/jajera/vsx-remote-ssh/actions/workflows/publish-open-vsx.yml)

Connect to and develop on remote servers via SSH with full VS Code integration.

## Features

### 🔐 Secure SSH Connections

- Password and SSH key authentication
- Connection caching and reconnection
- Multiple host management
- Automatic connection recovery

### 📁 Remote File System

- Browse remote directories
- Edit files directly on remote server
- File synchronization and caching
- Large file handling
- Binary file support

### 🖥️ Integrated Terminal

- SSH terminal integration
- Multiple terminal sessions
- Command history and completion
- Real-time output streaming

### 📊 Performance Monitoring

- Connection latency tracking
- Memory usage monitoring
- Performance statistics
- Resource usage alerts

### 🗂️ Workspace Management

- Save workspace contexts
- Quick workspace switching
- Remote workspace persistence
- Context-aware development

## Getting Started

### Quick Start

### 1. Add SSH Host

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Remote SSH: Add SSH Host"
3. Enter your server details:
   - **Name**: Your server name
   - **Host**: Server IP or domain
   - **Port**: SSH port (default: 22)
   - **Username**: Your SSH username
   - **Authentication**: Password or SSH key

### 2. Connect to Host

1. Press `Ctrl+Shift+P`
2. Type "Remote SSH: Connect to Host via SSH"
3. Select your configured host
4. Enter password or use SSH key

### 3. Open Remote Workspace

1. Press `Ctrl+Shift+P`
2. Type "Remote SSH: Open Remote Workspace"
3. Enter remote path (e.g., `/home/user/project`)
4. Start developing!

## Commands

| Command | Description |
|---------|-------------|
| `Remote SSH: Add SSH Host` | Add new SSH host configuration |
| `Remote SSH: Connect to Host via SSH` | Connect to configured host |
| `Remote SSH: Disconnect` | Disconnect from current host |
| `Remote SSH: Reconnect` | Reconnect to current host |
| `Remote SSH: Open Remote Terminal` | Open SSH terminal |
| `Remote SSH: Open Remote Workspace` | Open workspace on remote host |
| `Remote SSH: Show Active Connections` | View active SSH connections |
| `Remote SSH: Manage SSH Hosts` | Manage host configurations |
| `Remote SSH: Test Connection` | Test SSH connection |
| `Remote SSH: Show Host Information` | Display host details |
| `Remote SSH: Show Cache Statistics` | View cache performance |
| `Remote SSH: Clear Cache` | Clear file system cache |
| `Remote SSH: Export Configuration` | Export host configurations |
| `Remote SSH: Import Configuration` | Import host configurations |

## Configuration

### SSH Host Configuration

```json
{
  "name": "My Production Server",
  "host": "prod.example.com",
  "port": 22,
  "username": "deploy",
  "authMethod": "password",
  "password": "your-secure-password",
  "remoteWorkspace": "/home/deploy/app",
  "description": "Production deployment server"
}
```

### SSH Key Authentication

```json
{
  "name": "Development Server",
  "host": "dev.example.com",
  "port": 2222,
  "username": "developer",
  "authMethod": "key",
  "privateKeyPath": "~/.ssh/id_rsa",
  "passphrase": "optional-passphrase"
}
```

### Extension Settings

```json
{
  "remote-ssh.defaultPort": 22,
  "remote-ssh.connectTimeout": 15000,
  "remote-ssh.reconnectAttempts": 3
}
```

## Features in Detail

### Connection Management

- **Multiple Hosts**: Manage multiple SSH servers
- **Connection Pooling**: Efficient connection reuse
- **Auto-reconnection**: Automatic recovery from network issues
- **Connection Status**: Real-time connection monitoring

### File System Features

- **Remote Browsing**: Navigate remote directories
- **File Editing**: Edit files directly on remote server
- **File Caching**: Smart caching for performance
- **Large Files**: Handle large files efficiently
- **Binary Support**: Full binary file support

### Terminal Integration

- **SSH Terminal**: Full SSH terminal integration
- **Multiple Sessions**: Run multiple terminal sessions
- **Command History**: Persistent command history
- **Real-time Output**: Live command output

### Performance Features

- **Latency Monitoring**: Track connection latency
- **Memory Usage**: Monitor memory consumption
- **Performance Stats**: Detailed performance metrics
- **Resource Alerts**: Get notified of resource issues

### Workspace Management

- **Context Saving**: Save workspace configurations
- **Quick Switching**: Switch between workspaces
- **Context Persistence**: Maintain workspace state
- **Context Awareness**: Context-aware development

## Requirements

- **VS Code**: 1.74.0 or higher
- **SSH Server**: Any SSH-compatible server
- **Authentication**: Password or SSH key
- **Network**: Stable internet connection

## Installation

### From Open VSX Registry

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "SSH Remote"
4. Click Install

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "SSH Remote"
4. Click Install

### From VSIX File

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click "..." → "Install from VSIX..."
5. Select the downloaded file

## Usage Examples

### Basic Development Workflow

```bash
# 1. Add your development server
Remote SSH: Add SSH Host
→ Name: Dev Server
→ Host: dev.example.com
→ Username: developer

# 2. Connect to server
Remote SSH: Connect to Host via SSH
→ Select: Dev Server

# 3. Open project workspace
Remote SSH: Open Remote Workspace
→ Path: /home/developer/my-project

# 4. Start coding!
# Edit files, run terminal commands, etc.
```

### Production Deployment

```bash
# 1. Add production server
Remote SSH: Add SSH Host
→ Name: Production
→ Host: prod.example.com
→ Username: deploy

# 2. Connect and deploy
Remote SSH: Connect to Host via SSH
→ Select: Production

# 3. Open deployment directory
Remote SSH: Open Remote Workspace
→ Path: /var/www/app

# 4. Deploy your changes
# Edit configuration files, restart services, etc.
```

### Multi-Server Management

```bash
# Manage multiple servers
Remote SSH: Manage SSH Hosts
→ Add, edit, or delete hosts

# Test connections
Remote SSH: Test Connection
→ Verify connectivity

# Monitor performance
Remote SSH: Show Cache Statistics
→ View connection metrics
```

## Troubleshooting

### Connection Issues

- **"Connection refused"**: Check SSH server is running
- **"Authentication failed"**: Verify credentials
- **"Host key verification failed"**: Accept host key manually first
- **"Connection timeout"**: Check network and firewall settings
- **"ERR_REQUIRE_ESM" or module compatibility errors**: The extension uses CommonJS modules. If you encounter module system compatibility errors, ensure your VS Code version is compatible and the extension is properly installed.

### Performance Issues

- **Slow file operations**: Check network latency
- **High memory usage**: Reduce cache size in settings
- **Connection drops**: Enable auto-reconnection

### File System Issues

- **"Permission denied"**: Check file permissions on server
- **"File not found"**: Verify remote path exists
- **"Disk space"**: Check available disk space on server

## Support

### Getting Help

- **Documentation**: [GitHub Wiki](https://github.com/jajera/vsx-remote-ssh/wiki)
- **Issues**: [GitHub Issues](https://github.com/jajera/vsx-remote-ssh/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jajera/vsx-remote-ssh/discussions)

### Common Questions

- **Q**: Can I use SSH keys?
  **A**: Yes, both password and SSH key authentication are supported.

- **Q**: Does it work with Windows servers?
  **A**: Yes, any SSH-compatible server works, including Windows with OpenSSH.

- **Q**: Can I edit large files?
  **A**: Yes, the extension handles large files efficiently with streaming.

- **Q**: Is it secure?
  **A**: Yes, it uses standard SSH protocols and doesn't store passwords in plain text.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/jajera/vsx-remote-ssh.git

# Install dependencies
npm install

# Run tests
npm test

# Start development
npm run extension:dev
```

### Publishing

This extension is automatically published to the [Open VSX Registry](https://open-vsx.org/) when merging to the main branch. See [GitHub Actions Setup](docs/GITHUB_ACTIONS_SETUP.md) for configuration details.

## License

This extension is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a complete list of changes.

## Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- SSH functionality powered by [ssh2](https://github.com/mscdex/ssh2)
- File system operations with [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client)
