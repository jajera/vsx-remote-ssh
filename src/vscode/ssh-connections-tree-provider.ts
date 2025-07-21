import * as vscode from 'vscode';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';

/**
 * Tree item representing an SSH connection
 */
export class SSHConnectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly connection: SSHConnection,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(connection.config.host, collapsibleState);
    
    this.tooltip = `${connection.config.username}@${connection.config.host}:${connection.config.port || 22}`;
    this.description = `${connection.config.username}@${connection.config.host}`;
    this.contextValue = 'sshConnection';
    
    // Set icon based on connection status
    switch (connection.status) {
      case 'connected':
        this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('terminal.ansiGreen'));
        break;
      case 'connecting':
        this.iconPath = new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('terminal.ansiYellow'));
        break;
      case 'disconnected':
        this.iconPath = new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('terminal.ansiRed'));
        break;
      case 'error':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('server');
    }
    
    // Add command to connect if disconnected
    if (connection.status === 'disconnected') {
      this.command = {
        command: 'remote-ssh.connect',
        title: 'Connect',
        arguments: [connection]
      };
    }
  }
}

/**
 * Tree data provider for SSH connections
 */
export class SSHConnectionsTreeProvider implements vscode.TreeDataProvider<SSHConnectionTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SSHConnectionTreeItem | undefined | null | void> = new vscode.EventEmitter<SSHConnectionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SSHConnectionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private connectionManager: SSHConnectionManager) {
    // Note: Connection status change events would be handled here if supported by the connection manager
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SSHConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SSHConnectionTreeItem): Thenable<SSHConnectionTreeItem[]> {
    if (!element) {
      // Return root level items (SSH connections)
      const connections = this.connectionManager.getActiveConnections();
      return Promise.resolve(connections.map(connection => 
        new SSHConnectionTreeItem(connection, vscode.TreeItemCollapsibleState.None)
      ));
    }
    
    // No children for connection items
    return Promise.resolve([]);
  }
}