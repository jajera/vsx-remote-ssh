/**
 * VSX Remote SSH Extension Entry Point
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Global state
let activeConnections: Map<string, any> = new Map();
let activeTerminals: Map<string, vscode.Terminal> = new Map();
let savedHosts: Map<string, { host: string; username: string; port: number }> = new Map();
let defaultHost: string | null = null;
let cacheStats = { connections: 0, terminals: 0, hosts: 0 };

// Global extension instance
let extension: any;

/**
 * Test SSH connection using system ssh command
 */
async function testSSHConnection(host: string, username: string, password?: string): Promise<void> {
  try {
    vscode.window.showInformationMessage(`Testing connection to ${username}@${host}...`);
    
    return new Promise((resolve, reject) => {
      const sshProcess = spawn('ssh', [`${username}@${host}`, 'echo "SSH connection test successful"'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      sshProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      sshProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      sshProcess.on('close', (code) => {
        if (code === 0) {
          vscode.window.showInformationMessage(`SSH connection test successful! Output: ${output.trim()}`);
          resolve();
        } else {
          vscode.window.showErrorMessage(`SSH connection test failed: ${errorOutput}`);
          reject(new Error(errorOutput));
        }
      });
      
      sshProcess.on('error', (err) => {
        vscode.window.showErrorMessage(`SSH connection error: ${err.message}`);
        reject(err);
      });
    });
    
  } catch (error) {
    vscode.window.showErrorMessage(`SSH connection test failed: ${error}`);
  }
}

/**
 * Open terminal session using system ssh
 */
async function openTerminalSession(host: string, username: string, password?: string): Promise<void> {
  try {
    const terminal = vscode.window.createTerminal({
      name: `SSH: ${username}@${host}`,
      hideFromUser: false
    });
    
    activeTerminals.set(host, terminal);
    terminal.show();
    
    // Use system ssh command
    terminal.sendText(`ssh ${username}@${host}`);
    terminal.sendText(`echo "Connected to ${username}@${host}"`);
    
    vscode.window.showInformationMessage(`SSH terminal opened for ${username}@${host}`);
    
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open SSH terminal: ${error}`);
  }
}

/**
 * Show active connections
 */
function showActiveConnections(): void {
  if (activeTerminals.size === 0) {
    vscode.window.showInformationMessage('No active SSH terminals');
    return;
  }
  
  const terminals = Array.from(activeTerminals.keys());
  const message = `Active SSH terminals: ${terminals.join(', ')}`;
  vscode.window.showInformationMessage(message);
}

/**
 * Disconnect from host
 */
function disconnectFromHost(host: string): void {
  const terminal = activeTerminals.get(host);
  if (terminal) {
    terminal.dispose();
    activeTerminals.delete(host);
    vscode.window.showInformationMessage(`Disconnected from ${host}`);
  } else {
    vscode.window.showWarningMessage(`No active terminal for ${host}`);
  }
}

/**
 * Reconnect to host
 */
async function reconnectToHost(host: string): Promise<void> {
  const savedHost = savedHosts.get(host);
  if (!savedHost) {
    vscode.window.showErrorMessage(`No saved configuration for ${host}`);
    return;
  }
  
  // Disconnect first if connected
  disconnectFromHost(host);
  
  // Reconnect
  await openTerminalSession(savedHost.host, savedHost.username);
  vscode.window.showInformationMessage(`Reconnected to ${host}`);
}

/**
 * Add SSH host
 */
async function addSSHHost(): Promise<void> {
  const host = await vscode.window.showInputBox({
    prompt: 'Enter SSH host (e.g., example.com)',
    placeHolder: 'example.com'
  });
  
  if (!host) {return;}
  
  const username = await vscode.window.showInputBox({
    prompt: 'Enter username',
    placeHolder: 'username'
  });
  
  if (!username) {return;}
  
  const portStr = await vscode.window.showInputBox({
    prompt: 'Enter port (default: 22)',
    placeHolder: '22'
  });
  
  const port = portStr ? parseInt(portStr) : 22;
  
  const hostId = `${username}@${host}`;
  savedHosts.set(hostId, { host, username, port });
  
  vscode.window.showInformationMessage(`SSH host ${hostId} added successfully`);
}

/**
 * Manage SSH hosts
 */
async function manageSSHHosts(): Promise<void> {
  if (savedHosts.size === 0) {
    vscode.window.showInformationMessage('No saved SSH hosts. Use "Add SSH Host" to add hosts.');
    return;
  }
  
  const hosts = Array.from(savedHosts.keys());
  const selectedHost = await vscode.window.showQuickPick(hosts, {
    placeHolder: 'Select host to manage'
  });
  
  if (!selectedHost) {return;}
  
  const actions = [
    { label: 'Connect', action: 'connect' },
    { label: 'Edit', action: 'edit' },
    { label: 'Delete', action: 'delete' },
    { label: 'Set as Default', action: 'default' }
  ];
  
  const selectedAction = await vscode.window.showQuickPick(actions, {
    placeHolder: 'Select action'
  });
  
  if (!selectedAction) {return;}
  
  switch (selectedAction.action) {
    case 'connect':
      const savedHost = savedHosts.get(selectedHost);
      if (savedHost) {
        await openTerminalSession(savedHost.host, savedHost.username);
      }
      break;
    case 'edit':
      await editSSHHost(selectedHost);
      break;
    case 'delete':
      savedHosts.delete(selectedHost);
      vscode.window.showInformationMessage(`Host ${selectedHost} deleted`);
      break;
    case 'default':
      defaultHost = selectedHost;
      vscode.window.showInformationMessage(`Default host set to ${selectedHost}`);
      break;
  }
}

/**
 * Edit SSH host
 */
async function editSSHHost(hostId: string): Promise<void> {
  const savedHost = savedHosts.get(hostId);
  if (!savedHost) {
    vscode.window.showErrorMessage(`Host ${hostId} not found`);
    return;
  }
  
  const newHost = await vscode.window.showInputBox({
    prompt: 'Enter new host',
    value: savedHost.host
  });
  
  if (!newHost) {return;}
  
  const newUsername = await vscode.window.showInputBox({
    prompt: 'Enter new username',
    value: savedHost.username
  });
  
  if (!newUsername) {return;}
  
  const newPortStr = await vscode.window.showInputBox({
    prompt: 'Enter new port',
    value: savedHost.port.toString()
  });
  
  const newPort = newPortStr ? parseInt(newPortStr) : savedHost.port;
  
  // Remove old entry and add new one
  savedHosts.delete(hostId);
  const newHostId = `${newUsername}@${newHost}`;
  savedHosts.set(newHostId, { host: newHost, username: newUsername, port: newPort });
  
  vscode.window.showInformationMessage(`Host ${hostId} updated to ${newHostId}`);
}

/**
 * Delete SSH host
 */
async function deleteSSHHost(hostId?: string): Promise<void> {
  if (!hostId) {
    if (savedHosts.size === 0) {
      vscode.window.showInformationMessage('No saved SSH hosts to delete');
      return;
    }
    
    const hosts = Array.from(savedHosts.keys());
    hostId = await vscode.window.showQuickPick(hosts, {
      placeHolder: 'Select host to delete'
    });
  }
  
  if (!hostId) {return;}
  
  savedHosts.delete(hostId);
  vscode.window.showInformationMessage(`Host ${hostId} deleted`);
}

/**
 * Set default host
 */
async function setDefaultHost(hostId?: string): Promise<void> {
  if (!hostId) {
    if (savedHosts.size === 0) {
      vscode.window.showInformationMessage('No saved SSH hosts. Add hosts first.');
      return;
    }
    
    const hosts = Array.from(savedHosts.keys());
    hostId = await vscode.window.showQuickPick(hosts, {
      placeHolder: 'Select default host'
    });
  }
  
  if (!hostId) {return;}
  
  defaultHost = hostId;
  vscode.window.showInformationMessage(`Default host set to ${hostId}`);
}

/**
 * Open remote workspace
 */
async function openRemoteWorkspace(): Promise<void> {
  const host = await vscode.window.showInputBox({
    prompt: 'Enter SSH host',
    placeHolder: 'example.com'
  });
  
  if (!host) {return;}
  
  const username = await vscode.window.showInputBox({
    prompt: 'Enter username',
    placeHolder: 'username'
  });
  
  if (!username) {return;}
  
  const remotePath = await vscode.window.showInputBox({
    prompt: 'Enter remote path to open',
    placeHolder: '/home/username/project'
  });
  
  if (!remotePath) {return;}
  
  // Open workspace using VS Code's remote SSH
  const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${username}@${host}${remotePath}`);
  
  try {
    await vscode.commands.executeCommand('vscode.openFolder', uri);
    vscode.window.showInformationMessage(`Opening remote workspace: ${username}@${host}:${remotePath}`);
        } catch (error) {
    vscode.window.showErrorMessage(`Failed to open remote workspace: ${error}`);
  }
}

/**
 * Switch workspace
 */
async function switchWorkspace(): Promise<void> {
  const workspaces = vscode.workspace.workspaceFolders;
  if (!workspaces || workspaces.length === 0) {
    vscode.window.showInformationMessage('No workspaces to switch between');
    return;
  }
  
  const workspaceNames = workspaces.map(ws => ws.name);
  const selectedWorkspace = await vscode.window.showQuickPick(workspaceNames, {
    placeHolder: 'Select workspace to switch to'
  });
  
  if (!selectedWorkspace) {return;}
  
  const workspace = workspaces.find(ws => ws.name === selectedWorkspace);
  if (workspace) {
    await vscode.commands.executeCommand('vscode.openFolder', workspace.uri);
    vscode.window.showInformationMessage(`Switched to workspace: ${selectedWorkspace}`);
  }
}

/**
 * Show host information
 */
function showHostInfo(hostId?: string): void {
  if (!hostId) {
    if (savedHosts.size === 0) {
      vscode.window.showInformationMessage('No saved SSH hosts');
      return;
    }
    
    const hosts = Array.from(savedHosts.keys());
    hostId = hosts[0]; // Show first host if none specified
  }
  
  const savedHost = savedHosts.get(hostId);
  if (!savedHost) {
    vscode.window.showErrorMessage(`Host ${hostId} not found`);
    return;
  }
  
  const info = `Host: ${savedHost.host}\nUsername: ${savedHost.username}\nPort: ${savedHost.port}\nDefault: ${hostId === defaultHost ? 'Yes' : 'No'}`;
  vscode.window.showInformationMessage(`Host Information for ${hostId}:\n${info}`);
  }

  /**
   * Show cache statistics
   */
function showCacheStatistics(): void {
  const stats = {
    activeConnections: activeConnections.size,
    activeTerminals: activeTerminals.size,
    savedHosts: savedHosts.size,
    defaultHost: defaultHost || 'None'
  };
  
  const message = `Cache Statistics:\nActive Connections: ${stats.activeConnections}\nActive Terminals: ${stats.activeTerminals}\nSaved Hosts: ${stats.savedHosts}\nDefault Host: ${stats.defaultHost}`;
    vscode.window.showInformationMessage(message);
  }

  /**
 * Clear cache
 */
function clearCache(): void {
  activeConnections.clear();
  activeTerminals.forEach(terminal => terminal.dispose());
  activeTerminals.clear();
  savedHosts.clear();
  defaultHost = null;
  
      vscode.window.showInformationMessage('Cache cleared successfully');
  }

  /**
   * Export configuration
   */
function exportConfiguration(): void {
  const config = {
    savedHosts: Array.from(savedHosts.entries()),
    defaultHost: defaultHost,
    timestamp: new Date().toISOString()
  };
  
  const configStr = JSON.stringify(config, null, 2);
  
  vscode.window.showInformationMessage('Configuration exported to clipboard');
  vscode.env.clipboard.writeText(configStr);
  }

  /**
   * Import configuration
   */
async function importConfiguration(): Promise<void> {
  const configStr = await vscode.window.showInputBox({
    prompt: 'Paste configuration JSON',
    placeHolder: '{"savedHosts":[...]}'
  });
  
  if (!configStr) {return;}
  
  try {
    const config = JSON.parse(configStr);
    
    if (config.savedHosts) {
      savedHosts.clear();
      config.savedHosts.forEach(([key, value]: [string, any]) => {
        savedHosts.set(key, value);
      });
    }
    
    if (config.defaultHost) {
      defaultHost = config.defaultHost;
    }
    
      vscode.window.showInformationMessage('Configuration imported successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
    }
  }

  /**
 * Check if system ssh is available
 */
function checkSSHAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('which ssh', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    console.log('DEBUG: Activating VSX Remote SSH Extension...');
    
    // Check if system SSH is available
    const sshAvailable = checkSSHAvailable();
    
    // Register test commands
    const testDisposable = vscode.commands.registerCommand('remote-ssh.test', () => {
      vscode.window.showInformationMessage('SSH Extension is working!');
      console.log('DEBUG: Test command executed');
    });
    context.subscriptions.push(testDisposable);
    
    const testActivationDisposable = vscode.commands.registerCommand('remote-ssh.test-activation', () => {
      vscode.window.showInformationMessage('Extension activation test successful!');
      console.log('DEBUG: Activation test command executed');
    });
    context.subscriptions.push(testActivationDisposable);
    
    // Register real SSH commands
    const connectDisposable = vscode.commands.registerCommand('remote-ssh.connect', async () => {
      if (!sshAvailable) {
        vscode.window.showErrorMessage('System SSH not available. Please install OpenSSH.');
        return;
      }
      
      const host = await vscode.window.showInputBox({
        prompt: 'Enter SSH host (e.g., example.com)',
        placeHolder: 'example.com'
      });
      
      if (!host) {return;}
      
      const username = await vscode.window.showInputBox({
        prompt: 'Enter username',
        placeHolder: 'username'
      });
      
      if (!username) {return;}
      
      await openTerminalSession(host, username);
    });
    context.subscriptions.push(connectDisposable);
    
    const testConnectionDisposable = vscode.commands.registerCommand('remote-ssh.testConnection', async () => {
      if (!sshAvailable) {
        vscode.window.showErrorMessage('System SSH not available. Please install OpenSSH.');
        return;
      }
      
      const host = await vscode.window.showInputBox({
        prompt: 'Enter SSH host to test',
        placeHolder: 'example.com'
      });
      
      if (!host) {return;}
      
      const username = await vscode.window.showInputBox({
        prompt: 'Enter username',
        placeHolder: 'username'
      });
      
      if (!username) {return;}
      
      await testSSHConnection(host, username);
    });
    context.subscriptions.push(testConnectionDisposable);
    
    const openTerminalDisposable = vscode.commands.registerCommand('remote-ssh.openTerminal', async () => {
      if (!sshAvailable) {
        vscode.window.showErrorMessage('System SSH not available. Please install OpenSSH.');
        return;
      }
      
      const host = await vscode.window.showInputBox({
        prompt: 'Enter SSH host',
        placeHolder: 'example.com'
      });
      
      if (!host) {return;}
      
      const username = await vscode.window.showInputBox({
        prompt: 'Enter username',
        placeHolder: 'username'
      });
      
      if (!username) {return;}
      
      await openTerminalSession(host, username);
    });
    context.subscriptions.push(openTerminalDisposable);
    
    const showConnectionsDisposable = vscode.commands.registerCommand('remote-ssh.showConnections', () => {
      showActiveConnections();
    });
    context.subscriptions.push(showConnectionsDisposable);
    
    const disconnectDisposable = vscode.commands.registerCommand('remote-ssh.disconnect', async () => {
      if (activeTerminals.size === 0) {
        vscode.window.showInformationMessage('No active connections to disconnect');
        return;
      }
      
      const hosts = Array.from(activeTerminals.keys());
      const selectedHost = await vscode.window.showQuickPick(hosts, {
        placeHolder: 'Select host to disconnect from'
      });
      
      if (selectedHost) {
        disconnectFromHost(selectedHost);
      }
    });
    context.subscriptions.push(disconnectDisposable);
    
    const closeTerminalsDisposable = vscode.commands.registerCommand('remote-ssh.closeTerminals', () => {
      activeTerminals.forEach((terminal, host) => {
        terminal.dispose();
      });
      activeTerminals.clear();
      vscode.window.showInformationMessage('All SSH terminals closed');
    });
    context.subscriptions.push(closeTerminalsDisposable);
    
    // Register all remaining commands with real functionality
    const reconnectDisposable = vscode.commands.registerCommand('remote-ssh.reconnect', async () => {
      if (activeTerminals.size === 0) {
        vscode.window.showInformationMessage('No active connections to reconnect');
        return;
      }
      
      const hosts = Array.from(activeTerminals.keys());
      const selectedHost = await vscode.window.showQuickPick(hosts, {
        placeHolder: 'Select host to reconnect to'
      });
      
      if (selectedHost) {
        await reconnectToHost(selectedHost);
      }
    });
    context.subscriptions.push(reconnectDisposable);
    
    const addHostDisposable = vscode.commands.registerCommand('remote-ssh.addHost', () => {
      addSSHHost();
    });
    context.subscriptions.push(addHostDisposable);
    
    const manageHostsDisposable = vscode.commands.registerCommand('remote-ssh.manageHosts', () => {
      manageSSHHosts();
    });
    context.subscriptions.push(manageHostsDisposable);
    
    const editHostDisposable = vscode.commands.registerCommand('remote-ssh.editHost', (hostId?: string) => {
      editSSHHost(hostId || '');
    });
    context.subscriptions.push(editHostDisposable);
    
    const deleteHostDisposable = vscode.commands.registerCommand('remote-ssh.deleteHost', (hostId?: string) => {
      deleteSSHHost(hostId);
    });
    context.subscriptions.push(deleteHostDisposable);
    
    const setDefaultHostDisposable = vscode.commands.registerCommand('remote-ssh.setDefaultHost', (hostId?: string) => {
      setDefaultHost(hostId);
    });
    context.subscriptions.push(setDefaultHostDisposable);
    
    const openWorkspaceDisposable = vscode.commands.registerCommand('remote-ssh.openWorkspace', () => {
      openRemoteWorkspace();
    });
    context.subscriptions.push(openWorkspaceDisposable);
    
    const switchWorkspaceDisposable = vscode.commands.registerCommand('remote-ssh.switchWorkspace', () => {
      switchWorkspace();
    });
    context.subscriptions.push(switchWorkspaceDisposable);
    
    const showHostInfoDisposable = vscode.commands.registerCommand('remote-ssh.showHostInfo', (hostId?: string) => {
      showHostInfo(hostId);
    });
    context.subscriptions.push(showHostInfoDisposable);
    
    const showCacheStatisticsDisposable = vscode.commands.registerCommand('remote-ssh.showCacheStatistics', () => {
      showCacheStatistics();
    });
    context.subscriptions.push(showCacheStatisticsDisposable);
    
    const clearCacheDisposable = vscode.commands.registerCommand('remote-ssh.clearCache', () => {
      clearCache();
    });
    context.subscriptions.push(clearCacheDisposable);
    
    const exportConfigurationDisposable = vscode.commands.registerCommand('remote-ssh.exportConfiguration', () => {
      exportConfiguration();
    });
    context.subscriptions.push(exportConfigurationDisposable);
    
    const importConfigurationDisposable = vscode.commands.registerCommand('remote-ssh.importConfiguration', () => {
      importConfiguration();
    });
    context.subscriptions.push(importConfigurationDisposable);
    
    console.log('DEBUG: All commands registered successfully');
    console.log('DEBUG: VSX Remote SSH Extension activated successfully');
    
    // Show welcome message
    if (sshAvailable) {
      vscode.window.showInformationMessage('SSH Extension activated with full functionality! All commands are now working.');
    } else {
      vscode.window.showWarningMessage('SSH Extension activated but system SSH not found. Please install OpenSSH.');
    }
    
    // Show welcome message on first install
    const firstInstall = context.globalState.get('remote-ssh.firstInstall');
    if (firstInstall === undefined) {
      vscode.window.showInformationMessage(
        'VSX Remote SSH Extension has been installed. Use "Connect to Host via SSH" to get started.',
        'Show Documentation'
      ).then(selection => {
        if (selection === 'Show Documentation') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/jajera/vsx-remote-ssh'));
        }
      });
      
      context.globalState.update('remote-ssh.firstInstall', false);
    }
    
  } catch (error) {
    console.error('DEBUG: Failed to activate VSX Remote SSH Extension:', error);
    vscode.window.showErrorMessage(`Failed to activate VSX Remote SSH Extension: ${error}`);
  }
}

/**
 * Extension deactivation function
 */
export async function deactivate(): Promise<void> {
  try {
    console.log('Deactivating VSX Remote SSH Extension...');
    
    // Close all terminals
    activeTerminals.forEach(terminal => {
      terminal.dispose();
    });
    activeTerminals.clear();
    
    console.log('VSX Remote SSH Extension deactivated successfully');
  } catch (error) {
    console.error('Error during VSX Remote SSH Extension deactivation:', error);
  }
}

/**
 * Get the global extension instance
 */
export function getExtension(): any {
  return extension;
}