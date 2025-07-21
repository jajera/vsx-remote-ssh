# Remote Folder Mount Troubleshooting Guide

This document provides solutions for common issues you might encounter when using the Remote Folder Mount feature.

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Performance Issues](#performance-issues)
3. [File Synchronization Issues](#file-synchronization-issues)
4. [Error Messages](#error-messages)
5. [Resource Usage Issues](#resource-usage-issues)

## Connection Issues

### Mount Fails to Connect

**Symptoms:**

- Error message: "Failed to mount folder"
- Mount appears in workspace but shows as disconnected
- Files cannot be accessed

**Solutions:**

1. **Verify the remote path exists**
   - Check that the path you're trying to mount exists on the remote server
   - Ensure you have permissions to access the directory
   - Try navigating to the path using a remote terminal

2. **Check SSH connection**
   - Verify that your SSH connection is active
   - Try reconnecting to the host using `Remote SSH: Reconnect`
   - Check for any network issues that might be affecting the connection

3. **Check for path syntax issues**
   - Ensure you're using the correct path format for the remote system
   - For Windows remote hosts, use proper Windows path format
   - For Unix-like systems, use forward slashes

### Mount Disconnects Frequently

**Symptoms:**

- Mount shows as disconnected intermittently
- Operations fail with connection errors
- Explorer shows "Reconnecting..." status

**Solutions:**

1. **Check network stability**
   - Verify your network connection is stable
   - Check for high latency or packet loss
   - Consider using a more reliable network connection

2. **Adjust reconnection settings**
   - Increase the reconnection timeout in settings:

     ```json
     "remote-ssh.reconnectTimeout": 30000,
     "remote-ssh.reconnectAttempts": 5
     ```

   - Enable aggressive reconnection for unstable networks:

     ```json
     "remote-ssh.mount.aggressiveReconnect": true
     ```

3. **Monitor network conditions**
   - Use `Remote SSH: Show Mount Performance Stats` to view network quality
   - Check the "Network Conditions" section for issues
   - Consider enabling compression for poor network conditions:

     ```json
     "remote-ssh.mount.compressionEnabled": true
     ```

## Performance Issues

### Slow File Operations

**Symptoms:**

- File operations take longer than expected
- High latency when opening or saving files
- Explorer is slow to display directory contents

**Solutions:**

1. **Check mount performance metrics**
   - Use `Remote SSH: Show Mount Performance Stats` to identify bottlenecks
   - Look for low cache hit rates or high network latency
   - Check if specific operations are particularly slow

2. **Optimize cache settings**
   - Increase cache size for frequently accessed folders:

     ```json
     "remote-ssh.mount.cacheSize": 100
     ```

   - Increase cache TTL for more stable content:

     ```json
     "remote-ssh.mount.cacheTTL": 600000
     ```

3. **Enable prefetching for frequently accessed directories**
   - Use `Remote SSH: Optimize Mount Performance` to automatically enable prefetching
   - Or manually enable it in settings:

     ```json
     "remote-ssh.mount.prefetchEnabled": true,
     "remote-ssh.mount.prefetchDepth": 2
     ```

4. **Mount smaller, more specific folders**
   - Instead of mounting large directories, mount smaller subdirectories
   - This reduces the amount of data that needs to be transferred and cached

### High Latency

**Symptoms:**

- Operations feel sluggish
- Long delay between action and response
- Status bar shows high latency values

**Solutions:**

1. **Enable compression**
   - Turn on compression to reduce data transfer size:

     ```json
     "remote-ssh.mount.compressionEnabled": true
     ```

2. **Optimize file watching**
   - Exclude unnecessary directories from file watching:

     ```json
     "remote-ssh.mount.watchExcludePatterns": [
       "**/node_modules/**",
       "**/.git/**",
       "**/dist/**",
       "**/build/**"
     ]
     ```

3. **Use batch operations**
   - Enable operation batching to reduce round-trips:

     ```json
     "remote-ssh.mount.batchOperations": true
     ```

## File Synchronization Issues

### Changes Not Syncing

**Symptoms:**

- Local changes not appearing on remote server
- Remote changes not reflecting in VS Code
- File content appears outdated

**Solutions:**

1. **Check file watchers**
   - Ensure file watching is enabled:

     ```json
     "remote-ssh.mount.fileWatchingEnabled": true
     ```

   - Try increasing the polling interval for unreliable connections:

     ```json
     "remote-ssh.mount.fileWatchingPollingInterval": 5000
     ```

2. **Manually refresh the explorer view**
   - Right-click on the folder in Explorer and select "Refresh"
   - This forces a resynchronization with the remote server

3. **Check for file permission issues**
   - Ensure you have write permissions on the remote server
   - Check if files are locked by other processes
   - Verify that the remote user has appropriate access rights

### Conflicts Between Local and Remote Changes

**Symptoms:**

- Error messages about conflicting changes
- Files showing as modified on both sides
- Unable to save changes

**Solutions:**

1. **Use the conflict resolution dialog**
   - When prompted, choose whether to keep local or remote changes
   - Consider using "Compare" to see the differences before deciding

2. **Disable concurrent editing**
   - If multiple users are editing the same files, consider using a source control system
   - Or enable file locking:

     ```json
     "remote-ssh.mount.fileLockingEnabled": true
     ```

3. **Increase synchronization frequency**
   - Decrease the sync interval to catch changes more quickly:

     ```json
     "remote-ssh.mount.syncInterval": 1000
     ```

## Error Messages

### "Failed to Mount Folder"

**Possible causes and solutions:**

1. **Path doesn't exist**
   - Verify the path exists on the remote server
   - Create the directory if needed

2. **Permission denied**
   - Check that your SSH user has access to the directory
   - Adjust permissions on the remote server if needed

3. **SSH connection issues**
   - Reconnect to the SSH host
   - Check SSH key or password authentication

### "Mount Operation Timed Out"

**Possible causes and solutions:**

1. **Slow network connection**
   - Increase operation timeout:

     ```json
     "remote-ssh.mount.operationTimeout": 60000
     ```

2. **Large directory structure**
   - Mount a more specific subdirectory
   - Increase initial mount timeout:

     ```json
     "remote-ssh.mount.initialMountTimeout": 120000
     ```

3. **Server under heavy load**
   - Try mounting during off-peak hours
   - Check server resource usage

### "File Watch Error"

**Possible causes and solutions:**

1. **Too many files being watched**
   - Exclude unnecessary directories:

     ```json
     "remote-ssh.mount.watchExcludePatterns": ["**/node_modules/**"]
     ```

   - Increase the watch limit:

     ```json
     "remote-ssh.mount.maxWatchedFiles": 10000
     ```

2. **Server file watch limitations**
   - Some servers limit the number of inotify watches
   - Consider increasing server limits or using polling:

     ```json
     "remote-ssh.mount.usePolling": true
     ```

## Resource Usage Issues

### High CPU Usage

**Symptoms:**

- VS Code becomes sluggish
- High CPU usage reported by task manager
- Fan noise increases on your computer

**Solutions:**

1. **Reduce file watching scope**
   - Exclude large directories from watching
   - Decrease watch polling frequency

2. **Limit concurrent operations**
   - Set a lower limit for concurrent operations:

     ```json
     "remote-ssh.mount.maxConcurrentOperations": 4
     ```

3. **Disable automatic prefetching**
   - Turn off prefetching if it's causing high CPU usage:

     ```json
     "remote-ssh.mount.prefetchEnabled": false
     ```

### High Memory Usage

**Symptoms:**

- VS Code memory usage grows over time
- Performance degrades after extended use
- Out of memory errors

**Solutions:**

1. **Limit cache size**
   - Reduce the maximum cache size:

     ```json
     "remote-ssh.mount.cacheSize": 25
     ```

2. **Enable aggressive cache cleanup**
   - Set a lower cache TTL:

     ```json
     "remote-ssh.mount.cacheTTL": 120000
     ```

   - Enable aggressive cache cleanup:

     ```json
     "remote-ssh.mount.aggressiveCacheCleanup": true
     ```

3. **Mount smaller directories**
   - Split large mounts into smaller, more focused mounts
   - Unmount folders when not in use

### Network Bandwidth Issues

**Symptoms:**

- Other applications experience slow internet
- Large amount of data being transferred
- Network monitoring shows high usage

**Solutions:**

1. **Enable compression**
   - Turn on compression to reduce data transfer:

     ```json
     "remote-ssh.mount.compressionEnabled": true,
     "remote-ssh.mount.compressionLevel": 6
     ```

2. **Limit background operations**
   - Reduce background synchronization:

     ```json
     "remote-ssh.mount.backgroundSyncEnabled": false
     ```

3. **Set bandwidth limits**
   - Limit the maximum bandwidth usage:

     ```json
     "remote-ssh.mount.maxBandwidth": 1048576
     ```

## Advanced Troubleshooting

For persistent issues that aren't resolved by the solutions above:

1. **Enable diagnostic logging**
   - Set logging level to verbose:

     ```json
     "remote-ssh.logLevel": "trace",
     "remote-ssh.mount.logLevel": "debug"
     ```

   - Check the logs in the Output panel (View > Output > SSH Remote)

2. **Check server-side logs**
   - SSH server logs may contain additional information
   - Common locations: `/var/log/auth.log` or `/var/log/secure`

3. **Test with minimal configuration**
   - Disable extensions that might interfere
   - Try with default settings to isolate custom configuration issues

4. **Report issues**
   - If problems persist, report them on the GitHub repository
   - Include logs, configuration, and steps to reproduce
