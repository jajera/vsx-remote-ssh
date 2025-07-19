# VSX Remote SSH Extension Design

## Overview

The VSX Remote SSH extension enables seamless remote development by establishing SSH connections to remote servers and providing a native VS Code experience for editing files, running commands, and debugging applications on remote machines.

This design document also addresses the module system incompatibility issue that was preventing the extension from activating properly. The extension was configured to use ES modules (ESM) with "type": "module" in package.json, but VS Code's extension host was attempting to load it using CommonJS (CJS).

## Architecture

### High-Level Architecture

The extension uses a client-server architecture:

- **Client Side**: VS Code extension running locally
- **Server Side**: Lightweight server process on remote machine  
- **Communication**: Secure SSH tunnel for all data transfer

### Component Architecture

The extension consists of several key components:

1. **Connection Manager**: Handles SSH connection establishment, authentication, and lifecycle management
2. **File System Provider**: Implements VS Code's FileSystemProvider interface for remote file operations
3. **Terminal Provider**: Manages remote terminal sessions and command execution
4. **Extension Host Bridge**: Enables remote extension execution and communication
5. **Configuration Manager**: Handles SSH host configurations and credential storage
6. **Reconnection Handler**: Manages connection recovery and state restoration

## Module System Compatibility

### Problem Statement

The extension is currently failing to activate due to a module system incompatibility. The error message indicates:
```
Error [ERR_REQUIRE_ESM]: require() of ES Module [...]/extension.js from [...]/extensionHostProcess.js not supported.
extension.js is treated as an ES module file as it is a .js file whose nearest parent package.json contains "type": "module" which declares all .js files in that package scope as ES modules.
```

The error message suggests three possible solutions:
1. Rename extension.js to end in .cjs
2. Change the requiring code to use dynamic import()
3. Change "type": "module" to "type": "commonjs" in package.json

### Design Decision

After analyzing the options, we've decided to implement **Option 3: Change "type": "module" to "type": "commonjs"** in package.json. This approach offers the following advantages:

1. **Minimal Code Changes**: This approach requires the fewest changes to the codebase, primarily focusing on the package.json configuration and import/export syntax.
2. **Compatibility with VS Code**: VS Code's extension host is designed to work with CommonJS modules by default, making this approach the most compatible.
3. **Ecosystem Compatibility**: Many VS Code extension libraries and tools are designed with CommonJS in mind.
4. **Simplicity**: This approach avoids the complexity of maintaining dual module formats or implementing dynamic imports.

### Key Implementation Challenges

During implementation, we encountered several significant challenges:

1. **TypeScript to JavaScript Conversion**: The TypeScript compiler was generating JavaScript files with ES module syntax, but VS Code expected CommonJS. We had to ensure the TypeScript configuration was set to emit CommonJS modules.

2. **Test File Conflicts**: We discovered that the test-extension.ts file was causing conflicts with the main extension.ts file. Both files were registering the same commands, leading to unpredictable behavior where commands would sometimes work and sometimes not be found.

3. **Command Registration Issues**: Even after fixing the module system, commands were still not being properly registered. This was due to the way the extension was being activated and how commands were being registered in the extension.ts file.

4. **Module Resolution Conflicts**: The presence of both ESM and CommonJS syntax in different files caused module resolution conflicts, where imports would fail because the expected module format didn't match the actual format.

Resolving these issues required:
- Removing the test-extension.ts file completely
- Simplifying the extension implementation to focus on core functionality
- Ensuring consistent module syntax across all files
- Properly registering all commands in the extension.ts file
- Updating the activation events in package.json

### Implementation Details

1. **Package Configuration Changes**:
   - Remove "type": "module" from package.json to default to CommonJS
   - Update any ESM-specific configurations if present

2. **Code Changes**:
   - Convert ESM import statements (`import x from 'y'`) to CommonJS require statements (`const x = require('y')`)
   - Convert ESM export statements (`export function x()`) to CommonJS exports (`exports.x = function()` or `module.exports = {...}`)

3. **File Cleanup**:
   - Remove test-extension.ts file that was causing conflicts
   - Simplify extension implementation to improve compatibility

## Components and Interfaces

### 1. SSH Connection Manager

**Purpose**: Central component for managing SSH connections and authentication

**Key Interfaces**:

```typescript
interface SSHConnectionManager {
  connect(config: SSHConfig): Promise<SSHConnection>
  disconnect(connectionId: string): Promise<void>
  getActiveConnections(): SSHConnection[]
  reconnect(connectionId: string): Promise<SSHConnection>
}

interface SSHConfig {
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key' | 'agent'
  privateKeyPath?: string
  password?: string
}

interface SSHConnection {
  id: string
  config: SSHConfig
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
  lastConnected: Date
  execute(command: string): Promise<CommandResult>
  createSFTP(): Promise<SFTPClient>
}
```

### 2. Remote File System Provider

**Purpose**: Implements VS Code's file system interface for remote file operations

**Key Interfaces**:

```typescript
interface RemoteFileSystemProvider extends vscode.FileSystemProvider {
  readFile(uri: vscode.Uri): Promise<Uint8Array>
  writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void>
  readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>
  createDirectory(uri: vscode.Uri): Promise<void>
  delete(uri: vscode.Uri): Promise<void>
  rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void>
  stat(uri: vscode.Uri): Promise<vscode.FileStat>
}
```

### 3. Terminal Provider

**Purpose**: Manages remote terminal sessions and command execution

**Key Interfaces**:
```typescript
interface RemoteTerminalProvider {
  createTerminal(connection: SSHConnection, options?: TerminalOptions): Promise<RemoteTerminal>
  getActiveTerminals(): RemoteTerminal[]
  closeTerminal(terminalId: string): Promise<void>
}

interface RemoteTerminal {
  id: string
  connection: SSHConnection
  write(data: string): Promise<void>
  resize(cols: number, rows: number): Promise<void>
  onData: vscode.Event<string>
  onExit: vscode.Event<number>
}
```

### 4. Configuration Manager

**Purpose**: Handles SSH host configurations and secure credential storage

**Key Interfaces**:

```typescript
interface ConfigurationManager {
  saveHost(config: SSHHostConfig): Promise<void>
  getHosts(): Promise<SSHHostConfig[]>
  deleteHost(hostId: string): Promise<void>
  updateHost(hostId: string, config: Partial<SSHHostConfig>): Promise<void>
}

interface SSHHostConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key' | 'agent'
  privateKeyPath?: string
  remoteWorkspace?: string
}
```

## Data Models

### Connection State Model
```typescript
interface ConnectionState {
  connectionId: string
  status: ConnectionStatus
  config: SSHConfig
  lastActivity: Date
  reconnectAttempts: number
  workspaceUri?: vscode.Uri
}

enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error'
}
```

### File System Cache Model

```typescript
interface FileSystemCache {
  uri: string
  stat: vscode.FileStat
  children?: Map<string, FileSystemCache>
  lastUpdated: Date
  isDirty: boolean
}
```

### Terminal Session Model

```typescript
interface TerminalSession {
  id: string
  connectionId: string
  pid: number
  cwd: string
  environment: Record<string, string>
  isActive: boolean
  lastActivity: Date
}
```

## Error Handling

### Connection Errors
- **Authentication Failures**: Provide clear error messages and retry mechanisms
- **Network Timeouts**: Implement exponential backoff for reconnection attempts
- **Host Unreachable**: Display network troubleshooting guidance
- **Permission Denied**: Guide users through SSH key setup and file permissions

### File System Errors
- **Permission Denied**: Show appropriate error messages and suggest solutions
- **File Not Found**: Handle gracefully with user-friendly messages
- **Disk Space**: Detect and report storage issues on remote host
- **Network Interruption**: Queue operations and retry when connection is restored

### Terminal Errors
- **Shell Initialization**: Handle cases where default shell is unavailable
- **Command Execution**: Capture and display stderr appropriately
- **Process Termination**: Clean up resources when processes exit unexpectedly

### Recovery Strategies
- **Automatic Reconnection**: Attempt to reconnect with exponential backoff
- **State Restoration**: Restore open files and terminal sessions after reconnection
- **Graceful Degradation**: Continue working with cached data when possible
- **User Notification**: Keep users informed of connection status and recovery attempts

### Module System Errors
- **Activation Errors**: Handle module system incompatibility errors during extension activation
- **Import/Export Errors**: Ensure proper module syntax is used throughout the codebase
- **Dependency Compatibility**: Verify all dependencies work with the chosen module system

## Testing Strategy

### Unit Testing
- **Connection Manager**: Mock SSH connections and test authentication flows
- **File System Provider**: Test CRUD operations with mock SFTP clients
- **Configuration Manager**: Test secure storage and retrieval of SSH configs
- **Terminal Provider**: Mock terminal sessions and test command execution
- **Module Loading**: Verify that all modules can be loaded correctly with CommonJS

### Integration Testing
- **End-to-End Workflows**: Test complete user journeys from connection to file editing
- **Multi-Connection Scenarios**: Test handling of multiple simultaneous SSH connections
- **Reconnection Logic**: Test automatic reconnection and state restoration
- **Extension Compatibility**: Test with popular VS Code extensions
- **Extension Activation**: Verify that the extension activates without module system errors

### Performance Testing
- **File Transfer Performance**: Measure and optimize large file operations
- **Connection Latency**: Test responsiveness with high-latency connections
- **Memory Usage**: Monitor resource consumption with multiple connections
- **Concurrent Operations**: Test performance with multiple simultaneous file operations

### Security Testing
- **Credential Storage**: Verify secure handling of SSH keys and passwords
- **Connection Security**: Ensure proper SSH protocol implementation
- **Input Validation**: Test against malicious input and path traversal attacks
- **Permission Handling**: Verify proper file system permission enforcement

### User Experience Testing
- **Connection Setup**: Test ease of initial SSH configuration
- **Error Messages**: Verify clarity and helpfulness of error messages
- **Performance Perception**: Ensure responsive UI during remote operations
- **Workflow Integration**: Test seamless integration with existing VS Code workflows

## Alternative Approaches Considered

### Option 1: Rename extension.js to extension.cjs

**Pros**:
- Keeps ES modules for the rest of the codebase
- Clear indication of which files use which module system

**Cons**:
- May require changes to build configuration
- Potential for confusion with mixed module formats
- May require additional changes to other files that interact with extension.js

### Option 2: Use Dynamic Import

**Pros**:
- Keeps ES modules for the codebase
- Modern JavaScript approach

**Cons**:
- More complex implementation
- May require significant changes to how VS Code loads the extension
- Less standard approach for VS Code extensions

## Implementation Considerations

1. **Backward Compatibility**: Ensure that the changes don't break compatibility with existing functionality or dependencies.
2. **Build Process**: Update the build process if necessary to accommodate the module system changes.
3. **Documentation**: Update any documentation that references the module system or import/export patterns.
4. **Version Control**: Clearly document the changes in commit messages and version control.

## Conclusion

The VSX Remote SSH extension provides a comprehensive solution for remote development via SSH, with robust file system operations, terminal support, and extension compatibility. The module system compatibility issue has been resolved by changing from "type": "module" to CommonJS (by removing the type field) in package.json, which is the most straightforward and compatible approach. This approach requires minimal changes to the codebase and aligns with VS Code's extension host expectations.