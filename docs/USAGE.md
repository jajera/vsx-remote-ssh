# VSX Remote SSH Extension Usage Guide

This document provides detailed instructions on how to use the VSX Remote SSH Extension.

## Table of Contents

1. [Installation](#installation)
2. [Connecting to a Remote Host](#connecting-to-a-remote-host)
3. [Managing SSH Hosts](#managing-ssh-hosts)
4. [Working with Remote Files](#working-with-remote-files)
5. [Using Remote Folder Mounts](#using-remote-folder-mounts)
6. [Using Remote Terminals](#using-remote-terminals)
7. [Extension Compatibility](#extension-compatibility)
8. [Troubleshooting](#troubleshooting)

## Installation

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X)
3. Search for "Remote SSH"
4. Click Install

## Connecting to a Remote Host

### First-time Connection

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Connect to Host" and select the command
3. If you have no saved hosts, you'll be prompted to add a new host
4. Enter the SSH connection details:
   - Hostname or IP address
   - Username
   - Port (default: 22)
   - Authentication method (password, key, or agent)
5. If using key-based authentication, select your private key file
6. Wait for the connection to be established

### Connecting to a Saved Host

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Connect to Host" and select the command
3. Select a host from the list of saved hosts
4. Wait for the connection to be established

## Managing SSH Hosts

### Adding a New Host

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Add SSH Host" and select the command
3. Enter the host details:
   - Name (for display in the host list)
   - Hostname or IP address
   - Username
   - Port (default: 22)
   - Authentication method
   - Private key path (if using key authentication)
4. Click Save to store the host configuration

### Editing a Host

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Manage Hosts" and select the command
3. Select the host you want to edit
4. Choose "Edit" from the options
5. Modify the host details
6. Click Save to update the host configuration

### Deleting a Host

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Manage Hosts" and select the command
3. Select the host you want to delete
4. Choose "Delete" from the options
5. Confirm the deletion

## Working with Remote Files

### Browsing Remote Files

Once connected to a remote host, the Explorer view will show the remote file system. You can:

- Browse directories
- Open files for editing
- Create, rename, or delete files and folders

### Editing Remote Files

1. Navigate to the file in the Explorer view
2. Click on the file to open it in the editor
3. Make your changes
4. Save the file (Ctrl+S) to persist changes to the remote server

### Creating New Files and Folders

1. Right-click in the Explorer view
2. Select "New File" or "New Folder"
3. Enter the name of the file or folder
4. For files, the new file will open in the editor

## Using Remote Folder Mounts

Remote folder mounting allows you to add specific remote folders to your workspace, making them easily accessible and providing optimized performance.

### Mounting a Remote Folder

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Mount Remote Folder" and select the command
3. Select the SSH host you want to mount a folder from
4. Enter the path to the remote folder you want to mount
5. The folder will be added to your workspace and appear in the Explorer view

### Managing Mounted Folders

#### Via Command Palette

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Unmount Remote Folder" to remove a mount
3. Select the mounted folder you want to unmount

#### Via Explorer Context Menu

1. Right-click on a mounted folder in the Explorer view
2. Select "Unmount Remote Folder" from the context menu

### Mount Performance Optimization

The extension automatically optimizes performance for mounted folders based on your usage patterns and network conditions.

#### Viewing Mount Performance

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Show Mount Performance Stats" and select the command
3. A webview will open showing performance metrics for your mounted folders, including:
   - Operation success rates
   - Cache hit rates
   - Network quality
   - Data transfer statistics
   - Usage patterns

#### Optimizing Mount Performance

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type "Remote SSH: Optimize Mount Performance" and select the command
3. The extension will analyze your usage patterns and network conditions
4. Optimizations will be applied automatically, such as:
   - Adjusting cache size and TTL
   - Enabling/disabling prefetching
   - Enabling/disabling compression
   - Adapting to network conditions

### Mount Persistence

Mounted folders are automatically restored when you reopen VS Code, ensuring your workspace setup remains consistent.

## Using Remote Terminals

### Opening a Terminal

1. Press `Ctrl+Shift+`` to open a terminal
2. The terminal will automatically connect to the remote server
3. Run commands as if you were directly on the remote machine

### Managing Multiple Terminals

1. Click the + button in the terminal panel to create additional terminals
2. Use the dropdown in the terminal panel to switch between terminals
3. Close terminals using the trash icon or by typing `exit` in the terminal

## Extension Compatibility

Most VS Code extensions will work with remote files, but some extensions that rely on local binaries may not work correctly. The extension host bridge allows compatible extensions to run on the remote server.

### Installing Extensions for Remote Development

1. Open the Extensions view (Ctrl+Shift+X)
2. Find the extension you want to install
3. Click "Install" to install the extension
4. If the extension is compatible with remote development, it will be available when working with remote files

## Troubleshooting

### Connection Issues

If you're having trouble connecting to a remote host:

1. Check that the SSH server is running on the remote host
2. Verify that your network connection is stable
3. Ensure your SSH credentials are correct
4. Check firewall settings that might be blocking the connection
5. Try connecting manually using the terminal: `ssh username@hostname -p port`

### File System Issues

If you're having trouble with remote file operations:

1. Check file permissions on the remote server
2. Ensure you have sufficient disk space on the remote server
3. Try clearing the file cache: Command Palette > "Remote SSH: Clear Cache"

### Performance Issues

If you're experiencing slow performance:

1. Check your network connection quality
2. Consider using the file cache for frequently accessed files
3. Monitor performance using the "Remote SSH: Show Performance Stats" command
4. For mounted folders, use "Remote SSH: Show Mount Performance Stats" for detailed metrics
5. Apply optimizations with "Remote SSH: Optimize Mount Performance"

### Mount Issues

If you're having trouble with mounted folders:

1. **Mount fails to connect**: 
   - Verify the remote path exists and you have permissions to access it
   - Check that the SSH connection is active
   - Try reconnecting to the host first, then mounting again

2. **Slow mount performance**:
   - Use "Remote SSH: Show Mount Performance Stats" to identify bottlenecks
   - Consider mounting smaller, more specific folders instead of large directories
   - Enable compression for slow network connections
   - Adjust cache settings for frequently accessed files

3. **Mount disconnects frequently**:
   - Check your network stability
   - Increase the reconnection timeout in settings
   - Monitor network conditions with the performance stats view

4. **Changes not syncing**:
   - Ensure the file watcher is working correctly
   - Try manually refreshing the explorer view
   - Check for file permission issues on the remote server

### Getting Help

If you encounter issues not covered in this guide:

1. Check the [README.md](../README.md) file for additional information
2. Visit the [GitHub repository](https://github.com/jajera/vsx-remote-ssh) for the latest updates and issues
3. Submit an issue on GitHub if you've found a bug or have a feature request
