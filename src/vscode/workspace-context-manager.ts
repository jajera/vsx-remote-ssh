import * as vscode from 'vscode';
import { SSHConnectionManagerImpl } from '../ssh/connection-manager';
import { ConfigurationManager } from '../config/configuration-manager';
import { SSHConnection, SSHHostConfig } from '../interfaces/ssh';

/**
 * Interface for workspace context
 */
export interface WorkspaceContext {
  id: string;
  connectionId: string;
  workspacePath: string;
  name: string;
  lastAccessed: Date;
  openFiles: string[];
}

/**
 * Manages workspace contexts for multiple SSH connections
 */
export class WorkspaceContextManager {
  private static readonly WORKSPACE_CONTEXTS_KEY = 'vsx-remote-ssh.workspaceContexts';
  private contexts: Map<string, WorkspaceContext> = new Map();
  private activeContextId: string | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: SSHConnectionManagerImpl,
    private configManager: ConfigurationManager
  ) {
    this.loadContexts();
    this.registerEventHandlers();
  }

  /**
   * Load saved workspace contexts from extension storage
   */
  private loadContexts(): void {
    const savedContexts = this.context.globalState.get<WorkspaceContext[]>(
      WorkspaceContextManager.WORKSPACE_CONTEXTS_KEY,
      []
    );

    (savedContexts || []).forEach(ctx => {
      this.contexts.set(ctx.id, ctx);
    });
  }

  /**
   * Save workspace contexts to extension storage
   */
  private async saveContexts(): Promise<void> {
    const contextsArray = Array.from(this.contexts.values());
    await this.context.globalState.update(
      WorkspaceContextManager.WORKSPACE_CONTEXTS_KEY,
      contextsArray
    );
  }

  /**
   * Register event handlers for workspace changes
   */
  private registerEventHandlers(): void {
    // Track file opening
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && this.activeContextId) {
          const context = this.contexts.get(this.activeContextId);
          if (context) {
            const filePath = editor.document.uri.path;
            if (!context.openFiles.includes(filePath)) {
              context.openFiles.push(filePath);
              this.saveContexts();
            }
          }
        }
      })
    );

    // Track workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.updateActiveContext();
      })
    );
  }

  /**
   * Update the active context based on current workspace
   */
  private updateActiveContext(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.activeContextId = undefined;
      return;
    }

    // Check if the current workspace URI matches any of our SSH contexts
    const currentUri = workspaceFolders[0].uri;
    if (currentUri.scheme === 'ssh') {
      // Find or create a context for this SSH workspace
      for (const [id, ctx] of this.contexts.entries()) {
        if (currentUri.path.startsWith(ctx.workspacePath)) {
          this.activeContextId = id;
          ctx.lastAccessed = new Date();
          this.saveContexts();
          return;
        }
      }

      // No matching context found, create a new one
      this.createContextFromUri(currentUri);
    } else {
      this.activeContextId = undefined;
    }
  }

  /**
   * Create a new workspace context from a URI
   */
  private async createContextFromUri(uri: vscode.Uri): Promise<WorkspaceContext | undefined> {
    if (uri.scheme !== 'ssh') {
      return undefined;
    }

    // Parse the SSH URI to get connection details
    const match = uri.authority.match(/([^@]+)@([^:]+)(?::(\d+))?/);
    if (!match) {
      return undefined;
    }

    const [, username, host, portStr] = match;
    const port = portStr ? parseInt(portStr, 10) : 22;

    // Find the connection for this host
    const connections = this.connectionManager.getActiveConnections();
    let connection: SSHConnection | undefined;

    for (const conn of connections) {
      if (
        conn.config.host === host &&
        conn.config.username === username &&
        conn.config.port === port
      ) {
        connection = conn;
        break;
      }
    }

    if (!connection) {
      // No active connection found, try to find a matching host config
      const hosts = await this.configManager.getHosts();
      let hostConfig: SSHHostConfig | undefined;

      for (const config of hosts) {
        if (
          config.host === host &&
          config.username === username &&
          config.port === port
        ) {
          hostConfig = config;
          break;
        }
      }

      if (!hostConfig) {
        return undefined;
      }

      // Create a new connection
      try {
        connection = await this.connectionManager.connect(hostConfig);
      } catch (error) {
        console.error('Failed to create connection for workspace context:', error);
        return undefined;
      }
    }

    // Create a new context
    const contextId = `context_${Date.now()}`;
    const workspacePath = uri.path;
    const pathParts = workspacePath.split('/');
    const name = pathParts[pathParts.length - 1] || `${host}:${workspacePath}`;

    const newContext: WorkspaceContext = {
      id: contextId,
      connectionId: connection.id,
      workspacePath,
      name,
      lastAccessed: new Date(),
      openFiles: []
    };

    this.contexts.set(contextId, newContext);
    this.activeContextId = contextId;
    await this.saveContexts();

    return newContext;
  }

  /**
   * Get the active workspace context
   */
  getActiveContext(): WorkspaceContext | undefined {
    if (!this.activeContextId) {
      return undefined;
    }
    return this.contexts.get(this.activeContextId);
  }

  /**
   * Get all workspace contexts
   */
  getAllContexts(): WorkspaceContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Get contexts for a specific connection
   */
  getContextsForConnection(connectionId: string): WorkspaceContext[] {
    return Array.from(this.contexts.values()).filter(
      ctx => ctx.connectionId === connectionId
    );
  }

  /**
   * Switch to a different workspace context
   */
  async switchToContext(contextId: string): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }

    // Get the connection for this context
    const connection = this.connectionManager.getConnection(context.connectionId);
    if (!connection) {
      return false;
    }

    // Create a URI for the workspace
    const uri = vscode.Uri.parse(
      `ssh://${connection.config.username}@${connection.config.host}:${connection.config.port}${context.workspacePath}`
    );

    // Open the folder
    try {
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      return true;
    } catch (error) {
      console.error('Failed to switch workspace context:', error);
      return false;
    }
  }

  /**
   * Create a new workspace context
   */
  async createContext(
    connection: SSHConnection,
    workspacePath: string,
    name?: string
  ): Promise<WorkspaceContext> {
    const contextId = `context_${Date.now()}`;
    const pathParts = workspacePath.split('/');
    const contextName = name || pathParts[pathParts.length - 1] || `${connection.config.host}:${workspacePath}`;

    const newContext: WorkspaceContext = {
      id: contextId,
      connectionId: connection.id,
      workspacePath,
      name: contextName,
      lastAccessed: new Date(),
      openFiles: []
    };

    this.contexts.set(contextId, newContext);
    await this.saveContexts();

    return newContext;
  }

  /**
   * Delete a workspace context
   */
  async deleteContext(contextId: string): Promise<boolean> {
    const deleted = this.contexts.delete(contextId);
    if (deleted) {
      if (this.activeContextId === contextId) {
        this.activeContextId = undefined;
      }
      await this.saveContexts();
    }
    return deleted;
  }

  /**
   * Restore the last workspace after VS Code restart
   */
  async restoreLastWorkspace(): Promise<boolean> {
    // Find the most recently accessed context
    let mostRecent: WorkspaceContext | undefined;
    let mostRecentDate = new Date(0);

    for (const context of this.contexts.values()) {
      if (context.lastAccessed > mostRecentDate) {
        mostRecent = context;
        mostRecentDate = context.lastAccessed;
      }
    }

    if (mostRecent) {
      return await this.switchToContext(mostRecent.id);
    }

    return false;
  }

  /**
   * Update a workspace context
   */
  async updateContext(
    contextId: string,
    updates: Partial<WorkspaceContext>
  ): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }

    Object.assign(context, updates);
    await this.saveContexts();
    return true;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}