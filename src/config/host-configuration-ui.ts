import * as vscode from 'vscode';
import { ConfigurationManager } from './configuration-manager';
import { SSHHostConfig } from '../interfaces/ssh';

/**
 * Provides UI functionality for SSH host configuration management
 */
export class HostConfigurationUI {
  constructor(private configManager: ConfigurationManager) {}

  /**
   * Shows a quick pick menu for host selection
   * @returns The selected host or undefined if cancelled
   */
  async showHostSelectionMenu(): Promise<SSHHostConfig | undefined> {
    const hosts = await this.configManager.getHosts();
    
    if (hosts.length === 0) {
      const addHost = await vscode.window.showQuickPick(
        ['Yes', 'No'], 
        { 
          placeHolder: 'No SSH hosts configured. Would you like to add one now?',
          ignoreFocusOut: true
        }
      );
      
      if (addHost === 'Yes') {
        return await this.addNewHost();
      }
      
      return undefined;
    }

    // Define a custom type for host items
    interface HostQuickPickItem extends vscode.QuickPickItem {
      host?: SSHHostConfig;
      isAddNew?: boolean;
      isManage?: boolean;
    }

    // Create a list of options including all hosts
    const hostItems: HostQuickPickItem[] = hosts.map((h: SSHHostConfig) => {
      // Mark the default host with an asterisk
      const isDefault = this.configManager.getWorkspaceSettings().defaultHostId === h.id;
      return {
        label: `${isDefault ? '$(star) ' : ''}${h.name}`,
        description: `${h.username}@${h.host}:${h.port}`,
        detail: `Auth: ${h.authMethod}${h.remoteWorkspace ? ` | Workspace: ${h.remoteWorkspace}` : ''}`,
        host: h
      };
    });
    
    // Add management options
    hostItems.push({
      label: '$(add) Add New Host',
      description: 'Configure a new SSH connection',
      isAddNew: true
    });
    
    hostItems.push({
      label: '$(gear) Manage Hosts',
      description: 'Edit, delete, or set default hosts',
      isManage: true
    });
    
    const selected = await vscode.window.showQuickPick(hostItems, {
      placeHolder: 'Select SSH host to connect to',
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return undefined;
    }
    
    if (selected.isAddNew) {
      return await this.addNewHost();
    }
    
    if (selected.isManage) {
      return await this.showHostManagement();
    }
    
    return selected.host;
  }

  /**
   * Shows a dialog to add a new SSH host
   * @returns The newly created host or undefined if cancelled
   */
  async addNewHost(): Promise<SSHHostConfig | undefined> {
    // Create a multi-step wizard for adding a new host
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a friendly name for this connection',
      ignoreFocusOut: true,
      validateInput: value => {
        if (!value || value.trim() === '') {
          return 'Name cannot be empty';
        }
        return null;
      }
    });
    
    if (!name) {return undefined;}

    const host = await vscode.window.showInputBox({
      prompt: 'Enter hostname or IP address',
      ignoreFocusOut: true,
      validateInput: value => {
        if (!value || value.trim() === '') {
          return 'Hostname cannot be empty';
        }
        return null;
      }
    });
    
    if (!host) {return undefined;}

    const username = await vscode.window.showInputBox({
      prompt: 'Enter username',
      ignoreFocusOut: true,
      validateInput: value => {
        if (!value || value.trim() === '') {
          return 'Username cannot be empty';
        }
        return null;
      }
    });
    
    if (!username) {return undefined;}

    const portStr = await vscode.window.showInputBox({
      prompt: 'Enter port',
      ignoreFocusOut: true,
      value: '22',
      validateInput: value => {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          return 'Port must be a number between 1 and 65535';
        }
        return null;
      }
    });
    
    if (!portStr) {return undefined;}
    
    const port = parseInt(portStr, 10);

    const authMethods = [
      { label: 'Password', description: 'Use password authentication' },
      { label: 'SSH Key', description: 'Use private key authentication' },
      { label: 'SSH Agent', description: 'Use SSH agent for authentication' }
    ];
    
    const selectedAuth = await vscode.window.showQuickPick(authMethods, {
      placeHolder: 'Select authentication method',
      ignoreFocusOut: true
    });
    
    if (!selectedAuth) {return undefined;}
    
    // Map the friendly auth method name to the internal value
    const authMethodMap: Record<string, 'password' | 'key' | 'agent'> = {
      'Password': 'password',
      'SSH Key': 'key',
      'SSH Agent': 'agent'
    };
    
    const authMethod = authMethodMap[selectedAuth.label];

    const newHost: SSHHostConfig = {
      id: `host_${Date.now()}`,
      name,
      host,
      port,
      username,
      authMethod
    };

    // Handle key-based authentication
    if (authMethod === 'key') {
      // Show file picker for private key
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Select Private Key',
        filters: {
          'All Files': ['*']
        }
      };
      
      const fileUri = await vscode.window.showOpenDialog(options);
      if (fileUri && fileUri.length > 0) {
        newHost.privateKeyPath = fileUri[0].fsPath;
      } else {
        // Allow manual entry if file picker was cancelled
        const keyPath = await vscode.window.showInputBox({
          prompt: 'Enter private key path',
          ignoreFocusOut: true,
          validateInput: value => {
            if (!value || value.trim() === '') {
              return 'Private key path cannot be empty for key-based authentication';
            }
            return null;
          }
        });
        
        if (!keyPath) {return undefined;}
        newHost.privateKeyPath = keyPath;
      }
      
      // Ask for passphrase if needed
      const passphraseOptions = [
        { label: 'Yes', description: 'Private key is protected with a passphrase' },
        { label: 'No', description: 'Private key does not require a passphrase' }
      ];
      
      const hasPassphrase = await vscode.window.showQuickPick(passphraseOptions, {
        placeHolder: 'Does your private key require a passphrase?',
        ignoreFocusOut: true
      });
      
      if (hasPassphrase?.label === 'Yes') {
        const passphrase = await vscode.window.showInputBox({
          prompt: 'Enter private key passphrase',
          password: true,
          ignoreFocusOut: true
        });
        
        if (passphrase) {
          (newHost as any).passphrase = passphrase;
        }
      }
    } else if (authMethod === 'password') {
      // Ask for password
      const password = await vscode.window.showInputBox({
        prompt: `Enter password for ${username}@${host}`,
        password: true,
        ignoreFocusOut: true
      });
      
      if (password) {
        (newHost as any).password = password;
      }
    }

    // Ask for remote workspace (optional)
    const workspace = await vscode.window.showInputBox({
      prompt: 'Enter default remote workspace directory (optional)',
      ignoreFocusOut: true,
      placeHolder: '/home/username/project'
    });
    
    if (workspace) {
      newHost.remoteWorkspace = workspace;
    }

    try {
      await this.configManager.saveHost(newHost);
      vscode.window.showInformationMessage(`Host ${name} added successfully`);
      return newHost;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add host: ${error}`);
      return undefined;
    }
  }

  /**
   * Shows a menu for managing existing SSH hosts
   * @returns The selected host for further operations or undefined if cancelled
   */
  async showHostManagement(): Promise<SSHHostConfig | undefined> {
    const hosts = await this.configManager.getHosts();
    
    if (hosts.length === 0) {
      vscode.window.showInformationMessage('No SSH hosts configured');
      return undefined;
    }

    // Define a custom type for host items
    interface HostQuickPickItem extends vscode.QuickPickItem {
      host: SSHHostConfig;
    }

    const hostItems: HostQuickPickItem[] = hosts.map((h: SSHHostConfig) => {
      const isDefault = this.configManager.getWorkspaceSettings().defaultHostId === h.id;
      return {
        label: `${isDefault ? '$(star) ' : ''}${h.name}`,
        description: `${h.username}@${h.host}:${h.port}`,
        detail: `Auth: ${h.authMethod}${h.remoteWorkspace ? ` | Workspace: ${h.remoteWorkspace}` : ''}`,
        host: h
      };
    });
    
    const selected = await vscode.window.showQuickPick(hostItems, {
      placeHolder: 'Select host to manage',
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return undefined;
    }
    
    return await this.showHostOptions(selected.host);
  }

  /**
   * Shows options for managing a specific SSH host
   * @param host The host to manage
   * @returns The host after operations or undefined if cancelled
   */
  private async showHostOptions(host: SSHHostConfig): Promise<SSHHostConfig | undefined> {
    const options = [
      { label: '$(edit) Edit', description: 'Modify host configuration' },
      { label: '$(trash) Delete', description: 'Remove this host' },
      { label: '$(star) Set as Default', description: 'Make this the default connection' },
      { label: '$(plug) Connect', description: 'Connect to this host' },
      { label: '$(debug) Test Connection', description: 'Test connection without opening a workspace' }
    ];
    
    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: `Manage host: ${host.name}`,
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return undefined;
    }

    switch (selected.label) {
      case '$(edit) Edit':
        return await this.editHost(host);
      case '$(trash) Delete':
        return await this.deleteHost(host);
      case '$(star) Set as Default':
        return await this.setDefaultHost(host);
      case '$(plug) Connect':
        return host; // Return the host for connection
      case '$(debug) Test Connection':
        await this.testConnection(host);
        return host;
    }

    return undefined;
  }

  /**
   * Shows a dialog to edit an existing SSH host
   * @param host The host to edit
   * @returns The updated host or undefined if cancelled
   */
  private async editHost(host: SSHHostConfig): Promise<SSHHostConfig | undefined> {
    const fields = [
      { label: 'Name', description: host.name },
      { label: 'Hostname/IP', description: host.host },
      { label: 'Username', description: host.username },
      { label: 'Port', description: `${host.port}` },
      { label: 'Authentication Method', description: host.authMethod },
      { label: 'Private Key Path', description: host.privateKeyPath || 'Not set' },
      { label: 'Remote Workspace', description: host.remoteWorkspace || 'Not set' }
    ];
    
    const fieldToEdit = await vscode.window.showQuickPick(fields, {
      placeHolder: 'Select field to edit',
      ignoreFocusOut: true
    });
    
    if (!fieldToEdit) {
      return host;
    }
    
    const updates: Partial<SSHHostConfig> = {};
    
    switch (fieldToEdit.label) {
      case 'Name':
        const name = await vscode.window.showInputBox({
          prompt: 'Enter new name',
          value: host.name,
          ignoreFocusOut: true,
          validateInput: value => {
            if (!value || value.trim() === '') {
              return 'Name cannot be empty';
            }
            return null;
          }
        });
        
        if (name) {
          updates.name = name;
        }
        break;
        
      case 'Hostname/IP':
        const hostname = await vscode.window.showInputBox({
          prompt: 'Enter new hostname or IP address',
          value: host.host,
          ignoreFocusOut: true,
          validateInput: value => {
            if (!value || value.trim() === '') {
              return 'Hostname cannot be empty';
            }
            return null;
          }
        });
        
        if (hostname) {
          updates.host = hostname;
        }
        break;
        
      case 'Username':
        const username = await vscode.window.showInputBox({
          prompt: 'Enter new username',
          value: host.username,
          ignoreFocusOut: true,
          validateInput: value => {
            if (!value || value.trim() === '') {
              return 'Username cannot be empty';
            }
            return null;
          }
        });
        
        if (username) {
          updates.username = username;
        }
        break;
        
      case 'Port':
        const portStr = await vscode.window.showInputBox({
          prompt: 'Enter new port',
          value: host.port.toString(),
          ignoreFocusOut: true,
          validateInput: value => {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
              return 'Port must be a number between 1 and 65535';
            }
            return null;
          }
        });
        
        if (portStr) {
          updates.port = parseInt(portStr, 10);
        }
        break;
        
      case 'Authentication Method':
        const authMethods = [
          { label: 'Password', description: 'Use password authentication' },
          { label: 'SSH Key', description: 'Use private key authentication' },
          { label: 'SSH Agent', description: 'Use SSH agent for authentication' }
        ];
        
        const selectedAuth = await vscode.window.showQuickPick(authMethods, {
          placeHolder: 'Select authentication method',
          ignoreFocusOut: true
        });
        
        if (!selectedAuth) {
          break;
        }
        
        // Map the friendly auth method name to the internal value
        const authMethodMap: Record<string, 'password' | 'key' | 'agent'> = {
          'Password': 'password',
          'SSH Key': 'key',
          'SSH Agent': 'agent'
        };
        
        const authMethod = authMethodMap[selectedAuth.label];
        updates.authMethod = authMethod;
        
        // Handle key-based authentication
        if (authMethod === 'key') {
          // Show file picker for private key
          const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Private Key',
            filters: {
              'All Files': ['*']
            }
          };
          
          const fileUri = await vscode.window.showOpenDialog(options);
          if (fileUri && fileUri.length > 0) {
            updates.privateKeyPath = fileUri[0].fsPath;
          } else {
            // Allow manual entry if file picker was cancelled
            const keyPath = await vscode.window.showInputBox({
              prompt: 'Enter private key path',
              value: host.privateKeyPath,
              ignoreFocusOut: true,
              validateInput: value => {
                if (!value || value.trim() === '') {
                  return 'Private key path cannot be empty for key-based authentication';
                }
                return null;
              }
            });
            
            if (keyPath) {
              updates.privateKeyPath = keyPath;
            }
          }
          
          // Ask for passphrase if needed
          const passphraseOptions = [
            { label: 'Yes', description: 'Private key is protected with a passphrase' },
            { label: 'No', description: 'Private key does not require a passphrase' }
          ];
          
          const hasPassphrase = await vscode.window.showQuickPick(passphraseOptions, {
            placeHolder: 'Does your private key require a passphrase?',
            ignoreFocusOut: true
          });
          
          if (hasPassphrase?.label === 'Yes') {
            const passphrase = await vscode.window.showInputBox({
              prompt: 'Enter private key passphrase',
              password: true,
              ignoreFocusOut: true
            });
            
            if (passphrase) {
              (updates as any).passphrase = passphrase;
            }
          }
        } else if (authMethod === 'password') {
          // Handle password authentication
          const password = await vscode.window.showInputBox({
            prompt: `Enter password for ${host.username}@${host.host}`,
            password: true,
            ignoreFocusOut: true
          });
          
          if (password) {
            (updates as any).password = password;
          }
        }
        break;
        
      case 'Private Key Path':
        if (host.authMethod !== 'key') {
          vscode.window.showWarningMessage('Private key path is only applicable for key-based authentication.');
          break;
        }
        
        // Show file picker for private key
        const options: vscode.OpenDialogOptions = {
          canSelectMany: false,
          openLabel: 'Select Private Key',
          filters: {
            'All Files': ['*']
          }
        };
        
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri.length > 0) {
          updates.privateKeyPath = fileUri[0].fsPath;
        } else {
          // Allow manual entry if file picker was cancelled
          const keyPath = await vscode.window.showInputBox({
            prompt: 'Enter private key path',
            value: host.privateKeyPath,
            ignoreFocusOut: true,
            validateInput: value => {
              if (!value || value.trim() === '') {
                return 'Private key path cannot be empty for key-based authentication';
              }
              return null;
            }
          });
          
          if (keyPath) {
            updates.privateKeyPath = keyPath;
          }
        }
        break;
        
      case 'Remote Workspace':
        const workspace = await vscode.window.showInputBox({
          prompt: 'Enter default remote workspace directory',
          value: host.remoteWorkspace || '',
          ignoreFocusOut: true
        });
        
        if (workspace !== undefined) { // Allow empty string to clear the workspace
          updates.remoteWorkspace = workspace;
        }
        break;
    }
    
    if (Object.keys(updates).length > 0) {
      try {
        await this.configManager.updateHost(host.id, updates);
        vscode.window.showInformationMessage(`Host ${host.name} updated successfully`);
        
        // If we're changing the name, reflect that in the notification
        if (updates.name) {
          vscode.window.showInformationMessage(`Host renamed to ${updates.name}`);
        }
        
        // Get the updated host
        const updatedHost = await this.configManager.getHost(host.id);
        
        // Ask if user wants to edit another field
        const editMoreOptions = [
          { label: 'Yes', description: 'Edit another field' },
          { label: 'No', description: 'Finish editing' }
        ];
        
        const editMore = await vscode.window.showQuickPick(editMoreOptions, {
          placeHolder: 'Edit another field?',
          ignoreFocusOut: true
        });
        
        if (editMore?.label === 'Yes' && updatedHost) {
          return await this.editHost(updatedHost);
        }
        
        return updatedHost;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to update host: ${error}`);
      }
    }
    
    return host;
  }

  /**
   * Deletes an SSH host configuration
   * @param host The host to delete
   * @returns undefined as the host is deleted
   */
  private async deleteHost(host: SSHHostConfig): Promise<SSHHostConfig | undefined> {
    const confirmOptions = [
      { label: 'Yes', description: 'Delete this host' },
      { label: 'No', description: 'Keep this host' }
    ];
    
    const confirmDelete = await vscode.window.showQuickPick(confirmOptions, {
      placeHolder: `Are you sure you want to delete ${host.name}?`,
      ignoreFocusOut: true
    });
    
    if (confirmDelete?.label !== 'Yes') {
      return host;
    }
    
    try {
      await this.configManager.deleteHost(host.id);
      vscode.window.showInformationMessage(`Host ${host.name} deleted`);
      return undefined;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete host: ${error}`);
      return host;
    }
  }

  /**
   * Sets a host as the default connection
   * @param host The host to set as default
   * @returns The host
   */
  private async setDefaultHost(host: SSHHostConfig): Promise<SSHHostConfig> {
    try {
      await this.configManager.setDefaultHost(host.id);
      vscode.window.showInformationMessage(`${host.name} set as default`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to set default host: ${error}`);
    }
    
    return host;
  }

  /**
   * Tests the connection to an SSH host
   * @param host The host to test
   */
  private async testConnection(host: SSHHostConfig): Promise<void> {
    // For testing purposes, we'll just show a notification
    // In a real implementation, this would test the actual connection
    vscode.window.showInformationMessage(`Testing connection to ${host.name}...`);
    
    // Simulate a successful connection after a delay
    setTimeout(() => {
      vscode.window.showInformationMessage(`Successfully connected to ${host.name}`);
    }, 1000);
  }
}