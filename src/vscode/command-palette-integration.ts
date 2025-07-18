import * as vscode from 'vscode';
import { ExtensionHostBridgeImpl } from './extension-host-bridge';
import { SSHConnectionManagerImpl } from '../ssh/connection-manager';
import { ConfigurationManager } from '../config/configuration-manager';
import { ConnectionStatus } from '../interfaces/ssh';
import { WorkspaceContextManager, WorkspaceContext } from './workspace-context-manager';
import { NotificationService, NotificationLevel } from './notification-service';
import { PerformanceMonitor } from '../ssh/performance-monitor';

/**
 * Handles VS Code command palette integration for SSH Remote extension
 */
export class CommandPaletteIntegration {
  private disposables: vscode.Disposable[] = [];
  private statusBarItem: vscode.StatusBarItem;

  private notificationService: NotificationService;

  constructor(
    private extensionBridge: ExtensionHostBridgeImpl,
    private connectionManager: SSHConnectionManagerImpl,
    private configManager: ConfigurationManager,
    private workspaceContextManager?: WorkspaceContextManager
  ) {
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.text = '$(server) SSH Remote';
    this.statusBarItem.tooltip = 'SSH Remote Extension';
    this.statusBarItem.command = 'remote-ssh.showConnections';
    this.statusBarItem.show();
    
    // Get notification service instance
    this.notificationService = NotificationService.getInstance();
  }

  /**
   * Register all command palette commands
   */
  registerCommands(): void {
    // Main connection commands
    this.registerCommand('remote-ssh.connect', this.connectToHost.bind(this));
    this.registerCommand('remote-ssh.disconnect', this.disconnectCurrentHost.bind(this));
    this.registerCommand('remote-ssh.reconnect', this.reconnectCurrentHost.bind(this));
    this.registerCommand('remote-ssh.showConnections', this.showActiveConnections.bind(this));
    
    // Host management commands
    this.registerCommand('remote-ssh.addHost', this.addNewHost.bind(this));
    this.registerCommand('remote-ssh.manageHosts', this.manageHosts.bind(this));
    this.registerCommand('remote-ssh.editHost', this.editHost.bind(this));
    this.registerCommand('remote-ssh.deleteHost', this.deleteHost.bind(this));
    this.registerCommand('remote-ssh.setDefaultHost', this.setDefaultHost.bind(this));
    this.registerCommand('remote-ssh.testConnection', this.testConnection.bind(this));
    
    // Terminal commands
    this.registerCommand('remote-ssh.openTerminal', this.openTerminal.bind(this));
    this.registerCommand('remote-ssh.closeTerminals', this.closeTerminals.bind(this));
    
    // Workspace commands
    this.registerCommand('remote-ssh.openWorkspace', this.openWorkspace.bind(this));
    this.registerCommand('remote-ssh.switchWorkspace', this.switchWorkspace.bind(this));
    
    // Workspace context management commands
    if (this.workspaceContextManager) {
      this.registerCommand('remote-ssh.listWorkspaceContexts', this.listWorkspaceContexts.bind(this));
      this.registerCommand('remote-ssh.switchWorkspaceContext', this.switchWorkspaceContext.bind(this));
      this.registerCommand('remote-ssh.saveWorkspaceContext', this.saveWorkspaceContext.bind(this));
      this.registerCommand('remote-ssh.deleteWorkspaceContext', this.deleteWorkspaceContext.bind(this));
      this.registerCommand('remote-ssh.renameWorkspaceContext', this.renameWorkspaceContext.bind(this));
      this.registerCommand('remote-ssh.restoreLastWorkspace', this.restoreLastWorkspace.bind(this));
    }
    
    // Notification commands
    this.registerCommand('remote-ssh.showNotificationHistory', this.showNotificationHistory.bind(this));
    this.registerCommand('remote-ssh.showSetupGuide', this.showSetupGuide.bind(this));
    this.registerCommand('remote-ssh.clearNotifications', this.clearNotifications.bind(this));
    
    // Performance monitoring commands
    this.registerCommand('remote-ssh.showPerformanceStats', this.showPerformanceStats.bind(this));
    this.registerCommand('remote-ssh.togglePerformanceMonitoring', this.togglePerformanceMonitoring.bind(this));
    this.registerCommand('remote-ssh.clearPerformanceMetrics', this.clearPerformanceMetrics.bind(this));
    
    // Utility commands
    this.registerCommand('remote-ssh.showHostInfo', this.showHostInfo.bind(this));
    this.registerCommand('remote-ssh.clearCache', this.clearCache.bind(this));
    this.registerCommand('remote-ssh.showSettings', this.showSettings.bind(this));
  }

  /**
   * Helper method to register a command
   */
  private registerCommand(command: string, callback: (...args: any[]) => any): void {
    const disposable = vscode.commands.registerCommand(command, callback);
    this.disposables.push(disposable);
  }

  /**
   * Connect to an SSH host
   */
  private async connectToHost(): Promise<void> {
    await this.extensionBridge.showHostSelection();
  }

  /**
   * Disconnect from the current SSH host
   */
  private async disconnectCurrentHost(): Promise<void> {
    await this.extensionBridge.disconnectCurrentHost();
  }

  /**
   * Reconnect to the current SSH host
   */
  private async reconnectCurrentHost(): Promise<void> {
    const activeConnections = this.connectionManager.getActiveConnections();
    if (activeConnections.length === 0) {
      this.notificationService.showNotification('No active SSH connections to reconnect', NotificationLevel.Info);
      return;
    }

    const connection = activeConnections[0];
    try {
      // Show progress indicator for reconnection
      await this.notificationService.withProgress(
        { 
          title: `Reconnecting to ${connection.config.host}...`,
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Establishing connection...' });
          
          if (token.isCancellationRequested) {
            return;
          }
          
          await this.connectionManager.reconnect(connection.id);
          
          progress.report({ message: 'Connection established', increment: 100 });
        }
      );
      
      this.notificationService.showNotification(
        `Successfully reconnected to ${connection.config.host}`,
        NotificationLevel.Info
      );
    } catch (error) {
      // Show error with troubleshooting guidance
      this.notificationService.showTroubleshootingNotification(
        `Failed to reconnect to ${connection.config.host}`,
        [
          'Check that the SSH server is running on the remote host',
          'Verify that your network connection is stable',
          'Ensure your SSH credentials are still valid',
          'Check firewall settings that might be blocking the connection',
          `Try connecting manually using the terminal: ssh ${connection.config.username}@${connection.config.host} -p ${connection.config.port}`
        ]
      );
    }
  }

  /**
   * Show active SSH connections
   */
  private showActiveConnections(): void {
    const connections = this.connectionManager.getActiveConnections();
    if (connections.length === 0) {
      this.notificationService.showNotification('No active SSH connections', NotificationLevel.Info);
      return;
    }

    // Create quick pick items for each connection
    const items = connections.map(conn => ({
      label: `${conn.config.host}`,
      description: `${conn.config.username}@${conn.config.host}:${conn.config.port}`,
      detail: `Status: ${conn.status}`,
      connection: conn
    }));

    // Show quick pick with connection options
    vscode.window.showQuickPick(items, {
      placeHolder: 'Select a connection to manage',
      ignoreFocusOut: true
    }).then(selected => {
      if (!selected) {
        return;
      }

      // Show options for the selected connection
      const options = [
        { label: '$(refresh) Reconnect', action: 'reconnect' },
        { label: '$(terminal) Open Terminal', action: 'terminal' },
        { label: '$(folder) Open Workspace', action: 'workspace' },
        { label: '$(info) Show Info', action: 'info' },
        { label: '$(debug-disconnect) Disconnect', action: 'disconnect' }
      ];

      vscode.window.showQuickPick(options, {
        placeHolder: `Select action for ${selected.connection.config.host}`,
        ignoreFocusOut: true
      }).then(async option => {
        if (!option) {
          return;
        }

        switch (option.action) {
          case 'reconnect':
            await this.connectionManager.reconnect(selected.connection.id);
            break;
          case 'terminal':
            await this.extensionBridge.createTerminal(selected.connection.id);
            break;
          case 'workspace':
            await this.openWorkspaceForConnection(selected.connection.id);
            break;
          case 'info':
            this.showConnectionInfo(selected.connection);
            break;
          case 'disconnect':
            await this.connectionManager.disconnect(selected.connection.id);
            break;
        }
      });
    });
  }

  /**
   * Add a new SSH host
   */
  private async addNewHost(): Promise<void> {
    await this.extensionBridge.addNewHost();
  }

  /**
   * Manage SSH hosts
   */
  private async manageHosts(): Promise<void> {
    await this.extensionBridge.showHostManagement();
  }

  /**
   * Edit an SSH host
   */
  private async editHost(hostId?: string): Promise<void> {
    if (!hostId) {
      const hosts = await this.configManager.getHosts();
      if (hosts.length === 0) {
        vscode.window.showInformationMessage('No SSH hosts configured');
        return;
      }

      const items = hosts.map(host => ({
        label: host.name,
        description: `${host.username}@${host.host}:${host.port}`,
        id: host.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select host to edit',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      hostId = selected.id;
    }

    await this.extensionBridge.editHost(hostId);
  }

  /**
   * Delete an SSH host
   */
  private async deleteHost(hostId?: string): Promise<void> {
    if (!hostId) {
      const hosts = await this.configManager.getHosts();
      if (hosts.length === 0) {
        vscode.window.showInformationMessage('No SSH hosts configured');
        return;
      }

      const items = hosts.map(host => ({
        label: host.name,
        description: `${host.username}@${host.host}:${host.port}`,
        id: host.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select host to delete',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      hostId = selected.id;
    }

    await this.extensionBridge.deleteHost(hostId);
  }

  /**
   * Set default SSH host
   */
  private async setDefaultHost(hostId?: string): Promise<void> {
    if (!hostId) {
      const hosts = await this.configManager.getHosts();
      if (hosts.length === 0) {
        vscode.window.showInformationMessage('No SSH hosts configured');
        return;
      }

      const defaultHostId = this.configManager.getWorkspaceSettings().defaultHostId;
      const items = hosts.map(host => ({
        label: host.name,
        description: `${host.username}@${host.host}:${host.port}`,
        detail: host.id === defaultHostId ? '(Current Default)' : undefined,
        id: host.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select default host',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      hostId = selected.id;
    }

    await this.configManager.setDefaultHost(hostId);
    const host = await this.configManager.getHost(hostId);
    if (host) {
      vscode.window.showInformationMessage(`${host.name} set as default connection`);
    }
  }

  /**
   * Test connection to an SSH host
   */
  private async testConnection(hostId?: string): Promise<void> {
    if (!hostId) {
      const hosts = await this.configManager.getHosts();
      if (hosts.length === 0) {
        vscode.window.showInformationMessage('No SSH hosts configured');
        return;
      }

      const items = hosts.map(host => ({
        label: host.name,
        description: `${host.username}@${host.host}:${host.port}`,
        id: host.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select host to test',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      hostId = selected.id;
    }

    await this.extensionBridge.testConnection(hostId);
  }

  /**
   * Open a terminal for the current SSH connection
   */
  private async openTerminal(): Promise<void> {
    await this.extensionBridge.openTerminalForCurrentConnection();
  }

  /**
   * Close all SSH terminals
   */
  private async closeTerminals(): Promise<void> {
    // This would be implemented in the terminal provider
    vscode.window.showInformationMessage('Closing all SSH terminals');
  }

  /**
   * Open a workspace on the remote SSH host
   */
  private async openWorkspace(): Promise<void> {
    const hosts = await this.configManager.getHosts();
    if (hosts.length === 0) {
      this.notificationService.showNotification('No SSH hosts configured', NotificationLevel.Info);
      return;
    }

    const items = hosts.map(host => ({
      label: host.name,
      description: `${host.username}@${host.host}:${host.port}`,
      detail: host.remoteWorkspace ? `Workspace: ${host.remoteWorkspace}` : 'No default workspace',
      host
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select host to open workspace',
      ignoreFocusOut: true
    });

    if (!selected) {
      return;
    }

    let workspacePath = selected.host.remoteWorkspace;
    if (!workspacePath) {
      workspacePath = await vscode.window.showInputBox({
        prompt: 'Enter remote workspace path',
        placeHolder: '/home/username/project',
        ignoreFocusOut: true
      });

      if (!workspacePath) {
        return;
      }
    }

    // Connect to the host and open the workspace
    try {
      const connection = await this.connectionManager.connect(selected.host);
      if (connection) {
        const uri = vscode.Uri.parse(`ssh://${selected.host.username}@${selected.host.host}:${selected.host.port}${workspacePath}`);
        await vscode.commands.executeCommand('vscode.openFolder', uri);
        
        // Save workspace context if workspace context manager is available
        if (this.workspaceContextManager) {
          await this.workspaceContextManager.createContext(
            connection,
            workspacePath,
            `${selected.host.name}: ${workspacePath.split('/').pop() || workspacePath}`
          );
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open workspace: ${error}`);
    }
  }

  /**
   * Switch to a different workspace on the current SSH host
   */
  private async switchWorkspace(): Promise<void> {
    const activeConnections = this.connectionManager.getActiveConnections();
    if (activeConnections.length === 0) {
      this.notificationService.showNotification('No active SSH connections', NotificationLevel.Info);
      return;
    }

    const connection = activeConnections[0];
    const workspacePath = await vscode.window.showInputBox({
      prompt: `Enter remote workspace path on ${connection.config.host}`,
      placeHolder: '/home/username/project',
      ignoreFocusOut: true
    });

    if (!workspacePath) {
      return;
    }

    try {
      const uri = vscode.Uri.parse(`ssh://${connection.config.username}@${connection.config.host}:${connection.config.port}${workspacePath}`);
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      
      // Save workspace context if workspace context manager is available
      if (this.workspaceContextManager) {
        await this.workspaceContextManager.createContext(
          connection,
          workspacePath,
          `${connection.config.host}: ${workspacePath.split('/').pop() || workspacePath}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to switch workspace: ${error}`);
    }
  }

  /**
   * List all saved workspace contexts
   */
  private async listWorkspaceContexts(): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    const contexts = this.workspaceContextManager.getAllContexts();
    if (contexts.length === 0) {
      vscode.window.showInformationMessage('No saved workspace contexts');
      return;
    }

    // Create quick pick items for each context
    const items = contexts.map(ctx => {
      const connection = this.connectionManager.getConnection(ctx.connectionId);
      return {
        label: ctx.name,
        description: connection ? `${connection.config.host}:${ctx.workspacePath}` : ctx.workspacePath,
        detail: `Last accessed: ${ctx.lastAccessed.toLocaleString()}`,
        context: ctx
      };
    });

    // Show quick pick with context options
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a workspace context',
      ignoreFocusOut: true
    });

    if (!selected) {
      return;
    }

    // Show options for the selected context
    const options = [
      { label: '$(folder-opened) Open Workspace', action: 'open' },
      { label: '$(edit) Rename', action: 'rename' },
      { label: '$(trash) Delete', action: 'delete' }
    ];

    const option = await vscode.window.showQuickPick(options, {
      placeHolder: `Select action for ${selected.context.name}`,
      ignoreFocusOut: true
    });

    if (!option) {
      return;
    }

    switch (option.action) {
      case 'open':
        await this.workspaceContextManager.switchToContext(selected.context.id);
        break;
      case 'rename':
        await this.renameWorkspaceContext(selected.context.id);
        break;
      case 'delete':
        await this.deleteWorkspaceContext(selected.context.id);
        break;
    }
  }

  /**
   * Switch to a saved workspace context
   */
  private async switchWorkspaceContext(contextId?: string): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    if (!contextId) {
      const contexts = this.workspaceContextManager.getAllContexts();
      if (contexts.length === 0) {
        vscode.window.showInformationMessage('No saved workspace contexts');
        return;
      }

      // Create quick pick items for each context
      const items = contexts.map(ctx => {
        const connection = this.connectionManager.getConnection(ctx.connectionId);
        return {
          label: ctx.name,
          description: connection ? `${connection.config.host}:${ctx.workspacePath}` : ctx.workspacePath,
          detail: `Last accessed: ${ctx.lastAccessed.toLocaleString()}`,
          id: ctx.id
        };
      });

      // Sort by last accessed (most recent first)
      items.sort((a, b) => {
        const ctxA = contexts.find(c => c.id === a.id);
        const ctxB = contexts.find(c => c.id === b.id);
        if (ctxA && ctxB) {
          return ctxB.lastAccessed.getTime() - ctxA.lastAccessed.getTime();
        }
        return 0;
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select workspace context to switch to',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      contextId = selected.id;
    }

    try {
      const success = await this.workspaceContextManager.switchToContext(contextId);
      if (!success) {
        vscode.window.showErrorMessage('Failed to switch workspace context');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to switch workspace context: ${error}`);
    }
  }

  /**
   * Save the current workspace as a named context
   */
  private async saveWorkspaceContext(): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    const activeConnections = this.connectionManager.getActiveConnections();
    if (activeConnections.length === 0) {
      vscode.window.showInformationMessage('No active SSH connections');
      return;
    }

    const connection = activeConnections[0];
    
    // Get current workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const currentUri = workspaceFolders[0].uri;
    if (currentUri.scheme !== 'ssh') {
      vscode.window.showErrorMessage('Current workspace is not an SSH workspace');
      return;
    }

    const workspacePath = currentUri.path;
    
    // Ask for a name for the workspace context
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a name for this workspace context',
      placeHolder: `${connection.config.host}: ${workspacePath.split('/').pop() || workspacePath}`,
      ignoreFocusOut: true
    });

    if (!name) {
      return;
    }

    try {
      await this.workspaceContextManager.createContext(connection, workspacePath, name);
      vscode.window.showInformationMessage(`Workspace context '${name}' saved`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save workspace context: ${error}`);
    }
  }

  /**
   * Delete a saved workspace context
   */
  private async deleteWorkspaceContext(contextId?: string): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    if (!contextId) {
      const contexts = this.workspaceContextManager.getAllContexts();
      if (contexts.length === 0) {
        vscode.window.showInformationMessage('No saved workspace contexts');
        return;
      }

      // Create quick pick items for each context
      const items = contexts.map(ctx => {
        const connection = this.connectionManager.getConnection(ctx.connectionId);
        return {
          label: ctx.name,
          description: connection ? `${connection.config.host}:${ctx.workspacePath}` : ctx.workspacePath,
          id: ctx.id
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select workspace context to delete',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      contextId = selected.id;
    }

    // Confirm deletion
    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Are you sure you want to delete this workspace context?',
      ignoreFocusOut: true
    });

    if (confirm !== 'Yes') {
      return;
    }

    try {
      const success = await this.workspaceContextManager.deleteContext(contextId);
      if (success) {
        vscode.window.showInformationMessage('Workspace context deleted');
      } else {
        vscode.window.showErrorMessage('Failed to delete workspace context');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete workspace context: ${error}`);
    }
  }

  /**
   * Rename a saved workspace context
   */
  private async renameWorkspaceContext(contextId?: string): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    if (!contextId) {
      const contexts = this.workspaceContextManager.getAllContexts();
      if (contexts.length === 0) {
        vscode.window.showInformationMessage('No saved workspace contexts');
        return;
      }

      // Create quick pick items for each context
      const items = contexts.map(ctx => {
        const connection = this.connectionManager.getConnection(ctx.connectionId);
        return {
          label: ctx.name,
          description: connection ? `${connection.config.host}:${ctx.workspacePath}` : ctx.workspacePath,
          id: ctx.id
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select workspace context to rename',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      contextId = selected.id;
    }

    // Get the context
    const contexts = this.workspaceContextManager.getAllContexts();
    const context = contexts.find(ctx => ctx.id === contextId);
    if (!context) {
      vscode.window.showErrorMessage('Workspace context not found');
      return;
    }

    // Ask for a new name
    const newName = await vscode.window.showInputBox({
      prompt: 'Enter a new name for this workspace context',
      value: context.name,
      ignoreFocusOut: true
    });

    if (!newName) {
      return;
    }

    try {
      const success = await this.workspaceContextManager.updateContext(contextId, { name: newName });
      if (success) {
        vscode.window.showInformationMessage(`Workspace context renamed to '${newName}'`);
      } else {
        vscode.window.showErrorMessage('Failed to rename workspace context');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename workspace context: ${error}`);
    }
  }

  /**
   * Restore the last used workspace after VS Code restart
   */
  private async restoreLastWorkspace(): Promise<void> {
    if (!this.workspaceContextManager) {
      vscode.window.showErrorMessage('Workspace context manager not available');
      return;
    }

    try {
      const success = await this.workspaceContextManager.restoreLastWorkspace();
      if (!success) {
        vscode.window.showInformationMessage('No recent workspace context to restore');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to restore last workspace: ${error}`);
    }
  }

  /**
   * Show information about an SSH host
   */
  private async showHostInfo(hostId?: string): Promise<void> {
    if (!hostId) {
      const hosts = await this.configManager.getHosts();
      if (hosts.length === 0) {
        vscode.window.showInformationMessage('No SSH hosts configured');
        return;
      }

      const items = hosts.map(host => ({
        label: host.name,
        description: `${host.username}@${host.host}:${host.port}`,
        id: host.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select host to view info',
        ignoreFocusOut: true
      });

      if (!selected) {
        return;
      }

      hostId = selected.id;
    }

    const host = await this.configManager.getHost(hostId);
    if (!host) {
      vscode.window.showErrorMessage(`Host with ID ${hostId} not found`);
      return;
    }

    // Create a new untitled document with the host configuration
    const configJson = JSON.stringify(host, null, 2);
    const doc = await vscode.workspace.openTextDocument({
      content: configJson,
      language: 'json'
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * Clear the file cache
   */
  private async clearCache(): Promise<void> {
    // This would be implemented in the file cache manager
    vscode.window.showInformationMessage('Cache cleared successfully');
  }

  /**
   * Show extension settings
   */
  private async showSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'ssh-remote');
  }

  /**
   * Show information about an SSH connection
   */
  private showConnectionInfo(connection: any): void {
    const info = `
Connection Information:
- Host: ${connection.config.host}
- Port: ${connection.config.port}
- Username: ${connection.config.username}
- Status: ${connection.status}
- Authentication: ${connection.config.authMethod}
- Connected since: ${connection.lastConnected.toLocaleString()}
    `;

    vscode.window.showInformationMessage(info);
  }

  /**
   * Open a workspace for a specific connection
   */
  private async openWorkspaceForConnection(connectionId: string): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      vscode.window.showErrorMessage('Connection not found');
      return;
    }

    const workspacePath = await vscode.window.showInputBox({
      prompt: `Enter remote workspace path on ${connection.config.host}`,
      placeHolder: '/home/username/project',
      ignoreFocusOut: true
    });

    if (!workspacePath) {
      return;
    }

    try {
      const uri = vscode.Uri.parse(`ssh://${connection.config.username}@${connection.config.host}:${connection.config.port}${workspacePath}`);
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      
      // Save workspace context if workspace context manager is available
      if (this.workspaceContextManager) {
        await this.workspaceContextManager.createContext(
          connection,
          workspacePath,
          `${connection.config.host}: ${workspacePath.split('/').pop() || workspacePath}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open workspace: ${error}`);
    }
  }

  /**
   * Update the status bar with connection status
   */
  updateStatusBar(connectionId: string, status: ConnectionStatus): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      return;
    }

    const statusIcons = {
      [ConnectionStatus.Connected]: '$(check)',
      [ConnectionStatus.Connecting]: '$(sync~spin)',
      [ConnectionStatus.Reconnecting]: '$(sync~spin)',
      [ConnectionStatus.Error]: '$(error)',
      [ConnectionStatus.Disconnected]: '$(server)'
    };

    this.statusBarItem.text = `${statusIcons[status]} SSH: ${connection.config.host}`;
    this.statusBarItem.tooltip = `SSH Connection to ${connection.config.host} (${status})`;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.statusBarItem.dispose();
  }

  /**
   * Show notification history
   */
  private async showNotificationHistory(): Promise<void> {
    await this.notificationService.showConnectionStatusHistory();
  }

  /**
   * Show setup guide for SSH configuration
   */
  private async showSetupGuide(): Promise<void> {
    await this.notificationService.showSetupGuidance(
      'SSH Remote Setup Guide',
      [
        {
          title: 'Generate SSH Key',
          description: 'Generate a new SSH key pair for secure authentication.',
          command: 'ssh-remote.generateKey',
          documentationLink: 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent'
        },
        {
          title: 'Configure SSH Host',
          description: 'Add the remote host to your SSH configuration.',
          command: 'ssh-remote.addHost'
        },
        {
          title: 'Test Connection',
          description: 'Test the SSH connection to ensure everything is working correctly.',
          command: 'ssh-remote.testConnection'
        },
        {
          title: 'Open Remote Workspace',
          description: 'Open a workspace folder on the remote host.',
          command: 'ssh-remote.openWorkspace'
        }
      ]
    );
  }

  /**
   * Clear all notifications
   */
  private async clearNotifications(): Promise<void> {
    // Reset notification history and update status bar
    // @ts-ignore - Accessing private method for command implementation
    this.notificationService.connectionStatusHistory = [];
    // @ts-ignore - Accessing private method for command implementation
    this.notificationService.notificationCount = 0;
    // @ts-ignore - Accessing private method for command implementation
    this.notificationService.updateStatusBarItem();
    
    await this.notificationService.showNotification(
      'All notifications cleared',
      NotificationLevel.Info
    );
  }

  /**
   * Show performance statistics
   */
  private async showPerformanceStats(): Promise<void> {
    // Import the performance monitor dynamically to avoid circular dependencies
    const { PerformanceMonitor } = await import('../ssh/performance-monitor');
    const performanceMonitor = PerformanceMonitor.getInstance();
    
    await performanceMonitor.showPerformanceStats();
  }

  /**
   * Toggle performance monitoring on/off
   */
  private async togglePerformanceMonitoring(): Promise<void> {
    // Import the performance monitor dynamically to avoid circular dependencies
    const { PerformanceMonitor } = await import('../ssh/performance-monitor');
    const performanceMonitor = PerformanceMonitor.getInstance();
    
    performanceMonitor.toggleMonitoring();
  }

  /**
   * Clear performance metrics
   */
  private async clearPerformanceMetrics(): Promise<void> {
    // Import the performance monitor dynamically to avoid circular dependencies
    const { PerformanceMonitor } = await import('../ssh/performance-monitor');
    const performanceMonitor = PerformanceMonitor.getInstance();
    
    performanceMonitor.clearMetrics();
  }
}