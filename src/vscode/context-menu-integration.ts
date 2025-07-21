import * as vscode from 'vscode';
import { MountManager, MountPoint } from '../interfaces/mount';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';
import { SSHConnectionTreeItem } from './ssh-connections-tree-provider';

/**
 * Extended QuickPickItem with mount ID
 */
interface MountQuickPickItem extends vscode.QuickPickItem {
  mountId: string;
}

/**
 * Interface for context menu integration
 */
export interface ContextMenuIntegration {
  /**
   * Register context menu items and handlers
   */
  registerContextMenus(): void;
  
  /**
   * Dispose of the context menu integration
   */
  dispose(): void;
}

/**
 * Implementation of context menu integration for SSH connections and mounted folders
 */
export class ContextMenuIntegrationImpl implements ContextMenuIntegration {
  private readonly disposables: vscode.Disposable[] = [];
  
  constructor(
    private readonly mountManager: MountManager,
    private readonly connectionManager: SSHConnectionManager
  ) {}
  
  /**
   * Register context menu items and handlers
   */
  registerContextMenus(): void {
    this.registerSSHConnectionContextMenus();
    this.registerMountedFolderContextMenus();
  }
  
  /**
   * Register context menu items for SSH connections
   */
  private registerSSHConnectionContextMenus(): void {
    // Mount folder command for SSH connections
    const mountFolderCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.mountFolder',
      async (item: SSHConnectionTreeItem) => {
        if (!item || !item.connection) {
          vscode.window.showErrorMessage('No SSH connection selected');
          return;
        }
        
        await this.handleMountFolderFromConnection(item.connection);
      }
    );
    
    // Connect command for SSH connections
    const connectCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.connect',
      async (item: SSHConnectionTreeItem) => {
        if (!item || !item.connection) {
          vscode.window.showErrorMessage('No SSH connection selected');
          return;
        }
        
        await this.handleConnectToHost(item.connection);
      }
    );
    
    // Disconnect command for SSH connections
    const disconnectCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.disconnect',
      async (item: SSHConnectionTreeItem) => {
        if (!item || !item.connection) {
          vscode.window.showErrorMessage('No SSH connection selected');
          return;
        }
        
        await this.handleDisconnectFromHost(item.connection);
      }
    );
    
    // Open terminal command for SSH connections
    const openTerminalCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.openTerminal',
      async (item: SSHConnectionTreeItem) => {
        if (!item || !item.connection) {
          vscode.window.showErrorMessage('No SSH connection selected');
          return;
        }
        
        await this.handleOpenTerminal(item.connection);
      }
    );
    
    // Show connection info command
    const showInfoCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.showConnectionInfo',
      async (item: SSHConnectionTreeItem) => {
        if (!item || !item.connection) {
          vscode.window.showErrorMessage('No SSH connection selected');
          return;
        }
        
        this.handleShowConnectionInfo(item.connection);
      }
    );
    
    this.disposables.push(
      mountFolderCommand,
      connectCommand,
      disconnectCommand,
      openTerminalCommand,
      showInfoCommand
    );
  }
  
  /**
   * Register context menu items for mounted folders
   */
  private registerMountedFolderContextMenus(): void {
    // Unmount folder command
    const unmountCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.unmountFolder',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          // Show quick pick if no specific resource
          await this.handleUnmountFolderQuickPick();
          return;
        }
        
        await this.handleUnmountFolder(resource);
      }
    );
    
    // Refresh mount command
    const refreshMountCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.refreshMount',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          // Show quick pick if no specific resource
          await this.handleRefreshMountQuickPick();
          return;
        }
        
        await this.handleRefreshMount(resource);
      }
    );
    
    // Reconnect mount command
    const reconnectMountCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.reconnectMount',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          // Show quick pick if no specific resource
          await this.handleReconnectMountQuickPick();
          return;
        }
        
        await this.handleReconnectMount(resource);
      }
    );
    
    // Configure mount options command
    const configureMountCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.configureMountOptions',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          // Show quick pick if no specific resource
          await this.handleConfigureMountQuickPick();
          return;
        }
        
        await this.handleConfigureMount(resource);
      }
    );
    
    // Open in terminal command for mounted folders
    const openMountTerminalCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.openMountTerminal',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          vscode.window.showErrorMessage('No mounted folder selected');
          return;
        }
        
        await this.handleOpenMountTerminal(resource);
      }
    );
    
    // Show mount info command
    const showMountInfoCommand = vscode.commands.registerCommand(
      'remote-ssh.contextMenu.showMountInfo',
      async (resource: vscode.Uri) => {
        if (!resource || resource.scheme !== 'ssh-mount') {
          // Show quick pick if no specific resource
          await this.handleShowMountInfoQuickPick();
          return;
        }
        
        this.handleShowMountInfo(resource);
      }
    );
    
    this.disposables.push(
      unmountCommand,
      refreshMountCommand,
      reconnectMountCommand,
      configureMountCommand,
      openMountTerminalCommand,
      showMountInfoCommand
    );
  }
  
  /**
   * Handle mounting a folder from an SSH connection
   */
  private async handleMountFolderFromConnection(connection: SSHConnection): Promise<void> {
    try {
      // Check if connection is active
      if (connection.status !== 'connected') {
        const reconnect = await vscode.window.showWarningMessage(
          `Connection to ${connection.config.host} is not active. Would you like to connect first?`,
          'Connect and Mount',
          'Cancel'
        );
        
        if (reconnect !== 'Connect and Mount') {
          return;
        }
        
        // Try to reconnect
        await this.connectionManager.reconnect(connection.id);
      }
      
      // Prompt for remote path
      const remotePath = await vscode.window.showInputBox({
        prompt: `Enter remote path to mount from ${connection.config.host}`,
        placeHolder: '/home/user/project',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Remote path cannot be empty';
          }
          if (!value.startsWith('/')) {
            return 'Remote path must be absolute (start with /)';
          }
          return null;
        }
      });
      
      if (!remotePath) {
        return;
      }
      
      // Prompt for display name (optional)
      const displayName = await vscode.window.showInputBox({
        prompt: 'Enter display name for the mount (optional)',
        placeHolder: `${connection.config.host}:${remotePath.split('/').pop()}`,
        value: `${connection.config.host}:${remotePath.split('/').pop()}`
      });
      
      // Mount the folder
      const mountPoint = await this.mountManager.mountRemoteFolder(
        connection,
        remotePath,
        displayName || undefined
      );
      
      vscode.window.showInformationMessage(
        `Successfully mounted ${mountPoint.displayName} from ${connection.config.host}`
      );
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to mount folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle connecting to an SSH host
   */
  private async handleConnectToHost(connection: SSHConnection): Promise<void> {
    try {
      if (connection.status === 'connected') {
        vscode.window.showInformationMessage(`Already connected to ${connection.config.host}`);
        return;
      }
      
      await this.connectionManager.reconnect(connection.id);
      vscode.window.showInformationMessage(`Connected to ${connection.config.host}`);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to connect to ${connection.config.host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle disconnecting from an SSH host
   */
  private async handleDisconnectFromHost(connection: SSHConnection): Promise<void> {
    try {
      if (connection.status === 'disconnected') {
        vscode.window.showInformationMessage(`Already disconnected from ${connection.config.host}`);
        return;
      }
      
      await this.connectionManager.disconnect(connection.id);
      vscode.window.showInformationMessage(`Disconnected from ${connection.config.host}`);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to disconnect from ${connection.config.host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle opening a terminal for an SSH connection
   */
  private async handleOpenTerminal(connection: SSHConnection): Promise<void> {
    try {
      // Create a terminal for the SSH connection
      const terminal = vscode.window.createTerminal({
        name: `SSH: ${connection.config.username}@${connection.config.host}`,
        hideFromUser: false
      });
      
      terminal.show();
      terminal.sendText(`ssh ${connection.config.username}@${connection.config.host}`);
      
      vscode.window.showInformationMessage(`Opened terminal for ${connection.config.host}`);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle showing connection information
   */
  private handleShowConnectionInfo(connection: SSHConnection): void {
    const info = [
      `**Host:** ${connection.config.host}`,
      `**Username:** ${connection.config.username}`,
      `**Port:** ${connection.config.port || 22}`,
      `**Status:** ${connection.status}`,
      `**Last Connected:** ${connection.lastConnected.toLocaleString()}`,
      `**Authentication:** ${connection.config.authMethod || 'password'}`
    ].join('\n\n');
    
    vscode.window.showInformationMessage(
      `Connection Information for ${connection.config.host}`,
      { modal: true, detail: info }
    );
  }
  
  /**
   * Handle unmounting a folder
   */
  private async handleUnmountFolder(resource: vscode.Uri): Promise<void> {
    try {
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
        return;
      }
      
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to unmount "${mountPoint.displayName}"?`,
        'Unmount',
        'Cancel'
      );
      
      if (confirm !== 'Unmount') {
        return;
      }
      
      await this.mountManager.unmountFolder(mountId);
      vscode.window.showInformationMessage(`Unmounted ${mountPoint.displayName}`);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to unmount folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle unmounting with quick pick
   */
  private async handleUnmountFolderQuickPick(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No mounted folders to unmount');
      return;
    }
    
    const items: MountQuickPickItem[] = mountPoints.map(mp => ({
      label: mp.displayName,
      description: mp.remotePath,
      detail: `Status: ${mp.status}`,
      mountId: mp.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a folder to unmount'
    });
    
    if (selected) {
      await this.handleUnmountFolder(vscode.Uri.parse(`ssh-mount://${selected.mountId}/`));
    }
  }
  
  /**
   * Handle refreshing a mount
   */
  private async handleRefreshMount(resource: vscode.Uri): Promise<void> {
    try {
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
        return;
      }
      
      // Trigger a refresh by firing the workspace files changed event
      try {
        await vscode.workspace.fs.stat(resource);
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
        vscode.window.showInformationMessage(`Refreshed ${mountPoint.displayName}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to refresh mount: ${error instanceof Error ? error.message : String(error)}`);
      }
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to refresh mount: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle refreshing mount with quick pick
   */
  private async handleRefreshMountQuickPick(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No mounted folders to refresh');
      return;
    }
    
    const items: MountQuickPickItem[] = mountPoints.map(mp => ({
      label: mp.displayName,
      description: mp.remotePath,
      detail: `Status: ${mp.status}`,
      mountId: mp.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a folder to refresh'
    });
    
    if (selected) {
      await this.handleRefreshMount(vscode.Uri.parse(`ssh-mount://${selected.mountId}/`));
    }
  }
  
  /**
   * Handle reconnecting a mount
   */
  private async handleReconnectMount(resource: vscode.Uri): Promise<void> {
    try {
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
        return;
      }
      
      // Try to reconnect the underlying connection
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      if (connection) {
        await this.connectionManager.reconnect(connection.id);
        vscode.window.showInformationMessage(`Reconnected ${mountPoint.displayName}`);
      } else {
        vscode.window.showErrorMessage(`Connection not found for mount ${mountPoint.displayName}`);
      }
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to reconnect mount: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle reconnecting mount with quick pick
   */
  private async handleReconnectMountQuickPick(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints().filter(mp => mp.status !== 'connected');
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No disconnected mounts to reconnect');
      return;
    }
    
    const items: MountQuickPickItem[] = mountPoints.map(mp => ({
      label: mp.displayName,
      description: mp.remotePath,
      detail: `Status: ${mp.status}`,
      mountId: mp.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a folder to reconnect'
    });
    
    if (selected) {
      await this.handleReconnectMount(vscode.Uri.parse(`ssh-mount://${selected.mountId}/`));
    }
  }
  
  /**
   * Handle configuring mount options
   */
  private async handleConfigureMount(resource: vscode.Uri): Promise<void> {
    try {
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
        return;
      }
      
      const updatedMountPoint = await this.mountManager.configureMountOptions(mountId);
      if (updatedMountPoint) {
        vscode.window.showInformationMessage(`Configuration updated for ${updatedMountPoint.displayName}`);
      }
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to configure mount: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle configuring mount with quick pick
   */
  private async handleConfigureMountQuickPick(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No mounted folders to configure');
      return;
    }
    
    const items: MountQuickPickItem[] = mountPoints.map(mp => ({
      label: mp.displayName,
      description: mp.remotePath,
      detail: `Status: ${mp.status}`,
      mountId: mp.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a folder to configure'
    });
    
    if (selected) {
      await this.handleConfigureMount(vscode.Uri.parse(`ssh-mount://${selected.mountId}/`));
    }
  }
  
  /**
   * Handle opening terminal in mounted folder
   */
  private async handleOpenMountTerminal(resource: vscode.Uri): Promise<void> {
    try {
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
        return;
      }
      
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      if (!connection) {
        vscode.window.showErrorMessage(`Connection not found for mount ${mountPoint.displayName}`);
        return;
      }
      
      // Create a terminal for the mounted folder
      const terminal = vscode.window.createTerminal({
        name: `SSH: ${mountPoint.displayName}`,
        hideFromUser: false
      });
      
      terminal.show();
      terminal.sendText(`ssh ${connection.config.username}@${connection.config.host}`);
      terminal.sendText(`cd "${mountPoint.remotePath}"`);
      
      vscode.window.showInformationMessage(`Opened terminal in ${mountPoint.displayName}`);
      
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Handle showing mount information
   */
  private handleShowMountInfo(resource: vscode.Uri): void {
    const mountId = resource.authority;
    const mountPoint = this.mountManager.getMountPointById(mountId);
    
    if (!mountPoint) {
      vscode.window.showErrorMessage(`Mount point not found: ${mountId}`);
      return;
    }
    
    const connection = this.connectionManager.getConnection(mountPoint.connectionId);
    const connectionInfo = connection ? `${connection.config.username}@${connection.config.host}:${connection.config.port || 22}` : 'Unknown';
    
    const info = [
      `**Display Name:** ${mountPoint.displayName}`,
      `**Remote Path:** ${mountPoint.remotePath}`,
      `**Connection:** ${connectionInfo}`,
      `**Status:** ${mountPoint.status}`,
      `**Last Connected:** ${mountPoint.lastConnected.toLocaleString()}`,
      `**Auto Reconnect:** ${mountPoint.options.autoReconnect ? 'Yes' : 'No'}`,
      `**Cache Enabled:** ${mountPoint.options.cacheEnabled ? 'Yes' : 'No'}`,
      `**File Watching:** ${mountPoint.options.watchEnabled ? 'Yes' : 'No'}`
    ].join('\n\n');
    
    vscode.window.showInformationMessage(
      `Mount Information for ${mountPoint.displayName}`,
      { modal: true, detail: info }
    );
  }
  
  /**
   * Handle showing mount info with quick pick
   */
  private async handleShowMountInfoQuickPick(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No mounted folders');
      return;
    }
    
    const items: MountQuickPickItem[] = mountPoints.map(mp => ({
      label: mp.displayName,
      description: mp.remotePath,
      detail: `Status: ${mp.status}`,
      mountId: mp.id
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a folder to view information'
    });
    
    if (selected) {
      this.handleShowMountInfo(vscode.Uri.parse(`ssh-mount://${selected.mountId}/`));
    }
  }
  
  /**
   * Dispose of the context menu integration
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables.length = 0;
  }
}