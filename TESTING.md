# SSH Remote Extension Testing Guide

## Overview

This guide explains how to test the SSH Remote extension in real usage scenarios without deploying to the marketplace.

## Prerequisites

1. **VS Code** installed on your system
2. **Node.js** and **npm** installed
3. **SSH server** running (for testing connections)
4. **SSH key** or password authentication set up

## Testing Methods

### 1. **VS Code Extension Development Host**

This is the most common way to test extensions during development:

```bash
# Method 1: Using npm script
npm run extension:dev

# Method 2: Manual command
npm run compile
code --extensionDevelopmentPath=/path/to/ssh-remote
```

**What this does:**

- Opens a new VS Code window with your extension loaded
- Enables debugging and hot reloading
- Shows extension in the Extensions panel as "Development Host"

### 2. **VS Code Extension Test Host**

For testing with a clean environment:

```bash
npm run extension:test
```

**What this does:**

- Opens VS Code with only your extension loaded
- Disables all other extensions
- Provides a clean testing environment

### 3. **Package and Install Locally**

Create a VSIX package and install it:

```bash
# Create the package
npm run package

# Install the package in VS Code
code --install-extension vsx-remote-ssh-1.0.0.vsix
```

## Testing Scenarios

### **Basic Connection Testing**

1. **Open the Extension Development Host**
2. **Add an SSH Host:**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Remote SSH: Add SSH Host"
   - Enter your SSH server details:
     - Name: "Test Server"
     - Host: `your-server-ip`
     - Port: `22`
     - Username: `your-username`
     - Authentication: Password or SSH Key

3. **Test Connection:**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Test Connection"
   - Select your configured host
   - Verify connection success

### **File System Testing**

1. **Open Remote Workspace:**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Open Remote Workspace"
   - Select your host
   - Enter remote path (e.g., `/home/username/project`)

2. **Test File Operations:**
   - Create a new file in the remote workspace
   - Edit the file and save
   - Create a directory
   - Delete files/directories
   - Verify all operations work correctly

### **Terminal Testing**

1. **Open Remote Terminal:**
   - Press `Ctrl+Shift+P`
   - Type "Remote SSH: Open Remote Terminal"
   - Verify terminal opens with SSH connection

2. **Test Terminal Commands:**
   - Run basic commands: `ls`, `pwd`, `whoami`
   - Test file operations: `touch`, `mkdir`, `rm`
   - Verify command output is correct

### **Performance Monitoring**

1. **Enable Performance Monitoring:**
   - Look for the "SSH Perf" status bar item
   - Click it to open performance statistics
   - Verify metrics are being collected

2. **Test Performance Features:**
   - Perform file operations and watch metrics
   - Check latency measurements
   - Monitor memory usage

## Debugging

### **Extension Development Host Debugging**

1. **Set Breakpoints:**
   - Open source files in the development host
   - Set breakpoints in your TypeScript code
   - Use VS Code's debugger

2. **Console Logging:**
   - Open Developer Tools: `Help > Toggle Developer Tools`
   - Check the Console tab for logs
   - Use `console.log()` in your code

3. **Extension Logs:**
   - Open Command Palette: `Ctrl+Shift+P`
   - Type "Developer: Show Logs"
   - Select "Extension Host" to see extension logs

### **Common Issues and Solutions**

#### **Connection Issues**

```bash
# Test SSH connection manually first
ssh username@your-server-ip

# Check SSH configuration
cat ~/.ssh/config

# Verify SSH key permissions
chmod 600 ~/.ssh/id_rsa
```

#### **Permission Issues**

```bash
# Check file permissions on remote server
ls -la /path/to/workspace

# Fix permissions if needed
chmod 755 /path/to/workspace
```

#### **Extension Not Loading**

1. Check the Developer Console for errors
2. Verify `package.json` has correct `main` field
3. Ensure all dependencies are installed: `npm install`

## Testing Checklist

### **Connection Management**

- [ ] Add SSH host configuration
- [ ] Test connection with password authentication
- [ ] Test connection with SSH key authentication
- [ ] Test connection failure handling
- [ ] Test reconnection functionality

### **File System Operations**

- [ ] Read remote files
- [ ] Write remote files
- [ ] Create directories
- [ ] Delete files and directories
- [ ] Rename files
- [ ] List directory contents
- [ ] Handle large files
- [ ] Handle binary files

### **Terminal Operations**

- [ ] Open remote terminal
- [ ] Execute commands
- [ ] Handle command output
- [ ] Test interactive commands
- [ ] Test long-running processes

### **Performance Features**

- [ ] Enable/disable monitoring
- [ ] View performance statistics
- [ ] Monitor connection latency
- [ ] Monitor memory usage
- [ ] Clear performance metrics

### **Error Handling**

- [ ] Network disconnection
- [ ] Authentication failures
- [ ] Permission denied errors
- [ ] File not found errors
- [ ] Invalid host configuration

### **UI/UX Testing**

- [ ] Command palette integration
- [ ] Status bar updates
- [ ] Progress indicators
- [ ] Error messages
- [ ] Notifications

## Advanced Testing

### **Integration Testing**

Create a test script to automate testing:

```bash
#!/bin/bash
# test-extension.sh

echo "Testing SSH Remote Extension..."

# Test connection
echo "1. Testing connection..."
# Add your test commands here

# Test file operations
echo "2. Testing file operations..."
# Add your test commands here

echo "Testing complete!"
```

### **Performance Testing**

```bash
# Test with large files
dd if=/dev/zero of=large-file.dat bs=1M count=100

# Test with many small files
for i in {1..1000}; do
  echo "file $i" > "file-$i.txt"
done
```

### **Stress Testing**

```bash
# Test multiple connections
for i in {1..5}; do
  # Open multiple terminals
  # Perform concurrent operations
done
```

## Troubleshooting

### **Extension Won't Load**

1. Check `package.json` syntax
2. Verify `main` field points to correct file
3. Check for TypeScript compilation errors
4. Restart VS Code

### **Connection Problems**

1. Test SSH manually first
2. Check firewall settings
3. Verify SSH key permissions
4. Check SSH server configuration

### **Performance Issues**

1. Monitor network latency
2. Check server resources
3. Verify file transfer speeds
4. Review performance metrics

## Next Steps

After successful testing:

1. **Package the Extension:**

   ```bash
   npm run package
   ```

2. **Test the Package:**
   - Install the generated `.vsix` file
   - Test all functionality again

3. **Prepare for Publishing:**
   - Update version in `package.json`
   - Update README.md
   - Create release notes

## Resources

- [VS Code Extension API Documentation](https://code.visualstudio.com/api)
- [VS Code Extension Development Guide](https://code.visualstudio.com/api/get-started/your-first-extension)
- [SSH Protocol Documentation](https://tools.ietf.org/html/rfc4251)
- [Node.js SSH2 Library](https://github.com/mscdex/ssh2)
