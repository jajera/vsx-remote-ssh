import * as vscode from 'vscode';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';
import { NotificationService, NotificationLevel } from './notification-service';

/**
 * Handles VS Code command palette integration for mount management
 */
export class MountCommandPaletteIntegration {
  private disposables: vscode.Disposable[] = [];
  private notificationService: NotificationService;

  constructor(
    private mountManager: MountManager,
    private connectionManager: SSHConnectionManager
  ) {
    this.notificationService = NotificationService.getInstance();
  }

  /**
   * Register all mount-related command palette commands
   */
  registerCommands(): void {
    console.log('DEBUG: MountCommandPaletteIntegration.registerCommands called');
    
    // Mount management commands
    this.registerCommand('remote-ssh.mountFolder', this.mountRemoteFolder.bind(this));
    this.registerCommand('remote-ssh.unmountFolder', this.unmountRemoteFolder.bind(this));
    this.registerCommand('remote-ssh.manageMounts', this.manageMountedFolders.bind(this));
    this.registerCommand('remote-ssh.refreshMount', this.refreshMountedFolder.bind(this));
    this.registerCommand('remote-ssh.reconnectMount', this.reconnectMountedFolder.bind(this));
    this.registerCommand('remote-ssh.showMountStatus', this.showMountStatus.bind(this));
    this.registerCommand('remote-ssh.configureMountOptions', this.configureMountOptions.bind(this));
    
    console.log('DEBUG: MountCommandPaletteIntegration.registerCommands completed');
  }

  /**
   * Helper method to register a command
   */
  private registerCommand(command: string, callback: (...args: any[]) => any): void {
    console.log(`DEBUG: Registering command: ${command}`);
    const disposable = vscode.commands.registerCommand(command, callback);
    this.disposables.push(disposable);
    console.log(`DEBUG: Command registered: ${command}`);
  }

  /**
   * Dispose all registered commands
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  /**
   * Mount a remote folder
   */
  private async mountRemoteFolder(): Promise<void> {
    try {
      // Get active connections
      const connections = this.connectionManager.getActiveConnections();
      
      if (connections.length === 0) {
        this.notificationService.showNotification(
          'No active SSH connections. Please connect to a host first.',
          NotificationLevel.Error
        );
        return;
      }
      
      // Let user select a connection
      const connectionItems = connections.map(conn => ({
        label: `${conn.config.username}@${conn.config.host}`,
        description: `Port: ${conn.config.port}`,
        connection: conn
      }));
      
      const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
        placeHolder: 'Select SSH connection',
        ignoreFocusOut: true
      });
      
      if (!selectedConnection) {
        return;
      }
      
      // Ask for remote path
      const remotePath = await vscode.window.showInputBox({
        prompt: 'Enter remote path to mount',
        placeHolder: '/home/username/project',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || !value.trim()) {
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
      
      // Ask for display name (optional)
      const defaultDisplayName = remotePath.split('/').pop() || remotePath;
      const displayName = await vscode.window.showInputBox({
        prompt: 'Enter display name for the mount (optional)',
        placeHolder: defaultDisplayName,
        value: defaultDisplayName,
        ignoreFocusOut: true
      });
      
      // Show progress during mount operation
      await this.notificationService.withProgress(
        { 
          title: `Mounting ${remotePath}...`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Establishing mount point...' });
          
          if (token.isCancellationRequested) {
            return;
          }
          
          // Mount the folder
          const mountPoint = await this.mountManager.mountRemoteFolder(
            selectedConnection.connection,
            remotePath,
            displayName || defaultDisplayName
          );
          
          progress.report({ message: 'Mount point established', increment: 100 });
          
          this.notificationService.showNotification(
            `Successfully mounted ${mountPoint.remotePath} as ${mountPoint.displayName}`,
            NotificationLevel.Info
          );
        }
      );
    } catch (error) {
      this.notificationService.showTroubleshootingNotification(
        `Failed to mount remote folder: ${error}`,
        [
          'Check that the remote path exists on the server',
          'Verify that you have permission to access the folder',
          'Ensure your SSH connection is stable',
          'Try reconnecting to the SSH server'
        ]
      );
    }
  }

  /**
   * Unmount a remote folder
   */
  private async unmountRemoteFolder(): Promise<void> {
    try {
      const mountPoints = this.mountManager.getMountPoints();
      
      if (mountPoints.length === 0) {
        this.notificationService.showNotification(
          'No mounted folders to unmount.',
          NotificationLevel.Info
        );
        return;
      }
      
      // Let user select a mount point
      const mountItems = mountPoints.map(mount => ({
        label: mount.displayName,
        description: `${mount.remotePath} (${mount.status})`,
        mountPoint: mount
      }));
      
      const selectedMount = await vscode.window.showQuickPick(mountItems, {
        placeHolder: 'Select mount to unmount',
        ignoreFocusOut: true
      });
      
      if (!selectedMount) {
        return;
      }
      
      // Confirm unmount
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to unmount "${selectedMount.mountPoint.displayName}"?`,
        { modal: true },
        'Unmount'
      );
      
      if (confirm !== 'Unmount') {
        return;
      }
      
      // Show progress during unmount operation
      await this.notificationService.withProgress(
        { 
          title: `Unmounting ${selectedMount.mountPoint.displayName}...`,
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Removing mount point...' });
          
          // Unmount the folder
          await this.mountManager.unmountFolder(selectedMount.mountPoint.id);
          
          progress.report({ message: 'Mount point removed', increment: 100 });
          
          this.notificationService.showNotification(
            `Successfully unmounted ${selectedMount.mountPoint.displayName}`,
            NotificationLevel.Info
          );
        }
      );
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to unmount folder: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Manage mounted folders
   */
  private async manageMountedFolders(): Promise<void> {
    try {
      const mountPoints = this.mountManager.getMountPoints();
      
      if (mountPoints.length === 0) {
        this.notificationService.showNotification(
          'No mounted folders to manage.',
          NotificationLevel.Info
        );
        return;
      }
      
      // Let user select a mount point
      const mountItems = mountPoints.map(mount => ({
        label: mount.displayName,
        description: `${mount.remotePath} (${mount.status})`,
        detail: `Connection: ${mount.connectionId}`,
        mountPoint: mount
      }));
      
      const selectedMount = await vscode.window.showQuickPick(mountItems, {
        placeHolder: 'Select mount to manage',
        ignoreFocusOut: true
      });
      
      if (!selectedMount) {
        return;
      }
      
      // Show actions for the selected mount
      const actions = [
        { label: '$(gear) Configure Options', action: 'options' },
        { label: '$(refresh) Refresh', action: 'refresh' },
        { label: '$(debug-restart) Reconnect', action: 'reconnect' },
        { label: '$(folder-opened) Open in Explorer', action: 'open' },
        { label: '$(info) Show Details', action: 'details' },
        { label: '$(close) Unmount', action: 'unmount' }
      ];
      
      const selectedAction = await vscode.window.showQuickPick(actions, {
        placeHolder: 'Select action',
        ignoreFocusOut: true
      });
      
      if (!selectedAction) {
        return;
      }
      
      switch (selectedAction.action) {
        case 'options':
          await this.configureMountOptions(selectedMount.mountPoint.id);
          break;
        case 'refresh':
          await this.refreshMountedFolder(selectedMount.mountPoint.id);
          break;
        case 'reconnect':
          await this.reconnectMountedFolder(selectedMount.mountPoint.id);
          break;
        case 'open':
          await this.openMountInExplorer(selectedMount.mountPoint);
          break;
        case 'details':
          await this.showMountDetails(selectedMount.mountPoint);
          break;
        case 'unmount':
          await this.unmountRemoteFolder();
          break;
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to manage mounted folders: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Refresh a mounted folder
   * @param mountId Optional mount ID to refresh
   */
  private async refreshMountedFolder(mountId?: string): Promise<void> {
    try {
      if (!mountId) {
        const mountPoints = this.mountManager.getMountPoints();
        
        if (mountPoints.length === 0) {
          this.notificationService.showNotification(
            'No mounted folders to refresh.',
            NotificationLevel.Info
          );
          return;
        }
        
        // Let user select a mount point
        const mountItems = mountPoints.map(mount => ({
          label: mount.displayName,
          description: `${mount.remotePath} (${mount.status})`,
          mountPoint: mount
        }));
        
        const selectedMount = await vscode.window.showQuickPick(mountItems, {
          placeHolder: 'Select mount to refresh',
          ignoreFocusOut: true
        });
        
        if (!selectedMount) {
          return;
        }
        
        mountId = selectedMount.mountPoint.id;
      }
      
      // Get the mount point
      const mountPoint = this.mountManager.getMountPointById(mountId);
      if (!mountPoint) {
        this.notificationService.showNotification(
          `Mount point not found: ${mountId}`,
          NotificationLevel.Error
        );
        return;
      }
      
      // Show progress during refresh operation
      await this.notificationService.withProgress(
        { 
          title: `Refreshing ${mountPoint.displayName}...`,
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Refreshing mount point...' });
          
          // Update mount status to trigger refresh
          if (mountPoint.status === MountStatus.Connected) {
            // Temporarily disconnect and reconnect to force refresh
            this.mountManager.updateMountStatus(mountId!, MountStatus.Disconnected);
            this.mountManager.updateMountStatus(mountId!, MountStatus.Connected);
          } else {
            // If not connected, try to connect
            this.mountManager.updateMountStatus(mountId!, MountStatus.Connected);
          }
          
          progress.report({ message: 'Mount point refreshed', increment: 100 });
          
          this.notificationService.showNotification(
            `Refreshed mount ${mountPoint.displayName}`,
            NotificationLevel.Info
          );
        }
      );
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to refresh mount: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Reconnect a mount
   * @param mountId Optional mount ID to reconnect
   */
  private async reconnectMountedFolder(mountId?: string): Promise<void> {
    try {
      if (!mountId) {
        const mountPoints = this.mountManager.getMountPoints();
        
        if (mountPoints.length === 0) {
          this.notificationService.showNotification(
            'No mounted folders to reconnect.',
            NotificationLevel.Info
          );
          return;
        }
        
        // Let user select a mount point
        const mountItems = mountPoints.map(mount => ({
          label: mount.displayName,
          description: `${mount.remotePath} (${mount.status})`,
          mountPoint: mount
        }));
        
        const selectedMount = await vscode.window.showQuickPick(mountItems, {
          placeHolder: 'Select mount to reconnect',
          ignoreFocusOut: true
        });
        
        if (!selectedMount) {
          return;
        }
        
        mountId = selectedMount.mountPoint.id;
      }
      
      // Get the mount point
      const mountPoint = this.mountManager.getMountPointById(mountId);
      if (!mountPoint) {
        this.notificationService.showNotification(
          `Mount point not found: ${mountId}`,
          NotificationLevel.Error
        );
        return;
      }
      
      // Show progress during reconnection
      await this.notificationService.withProgress(
        { 
          title: `Reconnecting ${mountPoint.displayName}...`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Establishing connection...' });
          
          if (token.isCancellationRequested) {
            return;
          }
          
          // Update mount status to trigger reconnection
          this.mountManager.updateMountStatus(mountId!, MountStatus.Connecting);
          
          // Get the reconnection handler from the mount manager
          const reconnectionHandler = (this.mountManager as any).reconnectionHandler;
          if (reconnectionHandler && typeof reconnectionHandler.reconnect === 'function') {
            // Use the reconnection handler to reconnect
            await reconnectionHandler.reconnect(mountId!);
          } else {
            // Fall back to simple status update
            this.mountManager.updateMountStatus(mountId!, MountStatus.Connected);
          }
          
          progress.report({ message: 'Connection established', increment: 100 });
          
          this.notificationService.showNotification(
            `Reconnected mount ${mountPoint.displayName}`,
            NotificationLevel.Info
          );
        }
      );
    } catch (error) {
      this.notificationService.showTroubleshootingNotification(
        `Failed to reconnect mount: ${error}`,
        [
          'Check that the SSH server is running on the remote host',
          'Verify that your network connection is stable',
          'Ensure your SSH credentials are still valid',
          'Check that the remote path still exists'
        ]
      );
    }
  }

  /**
   * Show mount status
   */
  private async showMountStatus(): Promise<void> {
    try {
      const mountPoints = this.mountManager.getMountPoints();
      
      if (mountPoints.length === 0) {
        this.notificationService.showNotification(
          'No mounted folders.',
          NotificationLevel.Info
        );
        return;
      }
      
      // Create status items for each mount
      const mountItems = mountPoints.map(mount => {
        const lastConnected = mount.lastConnected ? 
          new Date(mount.lastConnected).toLocaleString() : 'Never';
        
        return {
          label: mount.displayName,
          description: `Status: ${mount.status}`,
          detail: `Path: ${mount.remotePath} | Last connected: ${lastConnected}`,
          mountPoint: mount
        };
      });
      
      // Show quick pick with mount status
      const selectedMount = await vscode.window.showQuickPick(mountItems, {
        placeHolder: 'Mount Status (select for details)',
        ignoreFocusOut: true
      });
      
      if (selectedMount) {
        // Show detailed status for selected mount
        await this.showMountDetails(selectedMount.mountPoint);
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to show mount status: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Configure mount options
   * @param mountId Optional mount ID to configure
   */
  private async configureMountOptions(mountId?: string): Promise<void> {
    try {
      if (!mountId) {
        const mountPoints = this.mountManager.getMountPoints();
        
        if (mountPoints.length === 0) {
          this.notificationService.showNotification(
            'No mounted folders to configure.',
            NotificationLevel.Info
          );
          return;
        }
        
        // Let user select a mount point
        const mountItems = mountPoints.map(mount => ({
          label: mount.displayName,
          description: `${mount.remotePath} (${mount.status})`,
          mountPoint: mount
        }));
        
        const selectedMount = await vscode.window.showQuickPick(mountItems, {
          placeHolder: 'Select mount to configure',
          ignoreFocusOut: true
        });
        
        if (!selectedMount) {
          return;
        }
        
        mountId = selectedMount.mountPoint.id;
      }
      
      // Get the mount point
      const mountPoint = this.mountManager.getMountPointById(mountId);
      if (!mountPoint) {
        this.notificationService.showNotification(
          `Mount point not found: ${mountId}`,
          NotificationLevel.Error
        );
        return;
      }
      
      // Configure mount options
      await this.mountManager.configureMountOptions(mountId);
      
      this.notificationService.showNotification(
        `Options updated for ${mountPoint.displayName}`,
        NotificationLevel.Info
      );
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to configure mount options: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Open mount in explorer
   * @param mountPoint Mount point to open
   */
  private async openMountInExplorer(mountPoint: MountPoint): Promise<void> {
    try {
      // Open the mount in explorer
      await vscode.commands.executeCommand('revealInExplorer', mountPoint.uri);
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to open mount in explorer: ${error}`,
        NotificationLevel.Error
      );
    }
  }

  /**
   * Show mount details
   * @param mountPoint Mount point to show details for
   */
  private async showMountDetails(mountPoint: MountPoint): Promise<void> {
    try {
      // Get connection details
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      const connectionDetails = connection ? 
        `${connection.config.username}@${connection.config.host}:${connection.config.port}` : 
        'Unknown connection';
      
      // Format last connected time
      const lastConnected = mountPoint.lastConnected ? 
        new Date(mountPoint.lastConnected).toLocaleString() : 'Never';
      
      // Create details markdown
      const details = `
## Mount Details: ${mountPoint.displayName}

- **Status:** ${mountPoint.status}
- **Remote Path:** ${mountPoint.remotePath}
- **Connection:** ${connectionDetails}
- **Mount ID:** ${mountPoint.id}
- **Last Connected:** ${lastConnected}
- **URI Scheme:** ${mountPoint.uri.scheme}
      `;
      
      // Show details in markdown preview
      const panel = vscode.window.createWebviewPanel(
        'mountDetails',
        `Mount Details: ${mountPoint.displayName}`,
        vscode.ViewColumn.One,
        {
          enableScripts: false,
          localResourceRoots: []
        }
      );
      
      panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Mount Details</title>
          <style>
            body { font-family: var(--vscode-font-family); padding: 20px; }
            h2 { color: var(--vscode-editor-foreground); }
            .detail-row { display: flex; margin-bottom: 10px; }
            .detail-label { font-weight: bold; width: 150px; }
            .detail-value { flex: 1; }
            .status-connected { color: var(--vscode-terminal-ansiGreen); }
            .status-disconnected { color: var(--vscode-terminal-ansiRed); }
            .status-connecting { color: var(--vscode-terminal-ansiYellow); }
          </style>
        </head>
        <body>
          <h2>Mount Details: ${mountPoint.displayName}</h2>
          
          <div class="detail-row">
            <div class="detail-label">Status:</div>
            <div class="detail-value status-${mountPoint.status.toLowerCase()}">${mountPoint.status}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">Remote Path:</div>
            <div class="detail-value">${mountPoint.remotePath}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">Connection:</div>
            <div class="detail-value">${connectionDetails}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">Mount ID:</div>
            <div class="detail-value">${mountPoint.id}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">Last Connected:</div>
            <div class="detail-value">${lastConnected}</div>
          </div>
          
          <div class="detail-row">
            <div class="detail-label">URI Scheme:</div>
            <div class="detail-value">${mountPoint.uri.scheme}</div>
          </div>
        </body>
        </html>
      `;
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to show mount details: ${error}`,
        NotificationLevel.Error
      );
    }
  }
}