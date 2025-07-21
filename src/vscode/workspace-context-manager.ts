import * as vscode from 'vscode';
import { MountPoint, WorkspaceIntegration } from '../interfaces/mount';
import { SSHConnection } from '../interfaces/ssh';

/**
 * Workspace context representing a saved workspace configuration
 */
export interface WorkspaceContext {
  id: string;
  name: string;
  connectionId: string;
  workspacePath: string;
  lastAccessed: Date;
}

/**
 * Interface for managing workspace contexts
 */
export interface WorkspaceContextManager {
  createContext(connection: SSHConnection, workspacePath: string, name: string): Promise<void>;
  getAllContexts(): WorkspaceContext[];
  switchToContext(contextId: string): Promise<boolean>;
  deleteContext(contextId: string): Promise<boolean>;
  updateContext(contextId: string, updates: Partial<WorkspaceContext>): Promise<boolean>;
  restoreLastWorkspace(): Promise<boolean>;
  dispose(): void;
}

/**
 * Implementation of WorkspaceContextManager
 */
export class WorkspaceContextManagerImpl implements WorkspaceContextManager {
  private contexts: Map<string, WorkspaceContext> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.loadContexts();
  }

  /**
   * Create a new workspace context
   */
  async createContext(connection: SSHConnection, workspacePath: string, name: string): Promise<void> {
    const context: WorkspaceContext = {
      id: this.generateId(),
      name,
      connectionId: connection.id,
      workspacePath,
      lastAccessed: new Date()
    };

    this.contexts.set(context.id, context);
    await this.saveContexts();
  }

  /**
   * Get all workspace contexts
   */
  getAllContexts(): WorkspaceContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Switch to a workspace context
   */
  async switchToContext(contextId: string): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }

    try {
      // Update last accessed time
      context.lastAccessed = new Date();
      this.contexts.set(contextId, context);
      await this.saveContexts();

      // Open the workspace
      const uri = vscode.Uri.parse(`ssh://${context.connectionId}${context.workspacePath}`);
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      return true;
    } catch (error) {
      console.error('Failed to switch to context:', error);
      return false;
    }
  }

  /**
   * Delete a workspace context
   */
  async deleteContext(contextId: string): Promise<boolean> {
    if (!this.contexts.has(contextId)) {
      return false;
    }

    this.contexts.delete(contextId);
    await this.saveContexts();
    return true;
  }

  /**
   * Update a workspace context
   */
  async updateContext(contextId: string, updates: Partial<WorkspaceContext>): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }

    const updatedContext = { ...context, ...updates };
    this.contexts.set(contextId, updatedContext);
    await this.saveContexts();
    return true;
  }

  /**
   * Restore the last accessed workspace
   */
  async restoreLastWorkspace(): Promise<boolean> {
    const contexts = this.getAllContexts();
    if (contexts.length === 0) {
      return false;
    }

    // Find the most recently accessed context
    const mostRecent = contexts.reduce((latest, current) => 
      current.lastAccessed > latest.lastAccessed ? current : latest
    );

    return this.switchToContext(mostRecent.id);
  }

  /**
   * Load contexts from storage
   */
  private loadContexts(): void {
    try {
      const stored = vscode.workspace.getConfiguration('remote-ssh').get('workspaceContexts', []);
      this.contexts = new Map(stored.map((ctx: any) => [
        ctx.id,
        { ...ctx, lastAccessed: new Date(ctx.lastAccessed) }
      ]));
    } catch (error) {
      console.error('Failed to load workspace contexts:', error);
      this.contexts = new Map();
    }
  }

  /**
   * Save contexts to storage
   */
  private async saveContexts(): Promise<void> {
    try {
      const contexts = Array.from(this.contexts.values());
      await vscode.workspace.getConfiguration('remote-ssh').update('workspaceContexts', contexts, vscode.ConfigurationTarget.Global);
    } catch (error) {
      console.error('Failed to save workspace contexts:', error);
    }
  }

  /**
   * Generate a unique ID for a context
   */
  private generateId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Dispose of the manager
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

/**
 * Implementation of WorkspaceIntegration for integrating mounts with VS Code workspace
 */
export class WorkspaceIntegrationImpl implements WorkspaceIntegration {
  private readonly _onDidChangeMountWorkspaceState = new vscode.EventEmitter<MountPoint>();
  
  /**
   * Event that fires when a mount's workspace state changes
   */
  readonly onDidChangeMountWorkspaceState = this._onDidChangeMountWorkspaceState.event;
  
  /**
   * Add a mount to the workspace
   * @param mountPoint Mount point to add
   */
  async addMountToWorkspace(mountPoint: MountPoint): Promise<void> {
    // Check if workspace folders exist
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    // Check if this mount is already in the workspace
    const existingIndex = this.findMountIndexInWorkspace(mountPoint.id);
    
    if (existingIndex >= 0) {
      // Already in workspace, update it
      return this.updateMountInWorkspace(mountPoint);
    }
    
    // Add to workspace
    const success = vscode.workspace.updateWorkspaceFolders(
      workspaceFolders.length,
      0,
      { uri: mountPoint.uri, name: mountPoint.displayName }
    );
    
    if (!success) {
      throw new Error(`Failed to add mount ${mountPoint.id} to workspace`);
    }
    
    // Notify listeners
    this._onDidChangeMountWorkspaceState.fire(mountPoint);
  }
  
  /**
   * Remove a mount from the workspace
   * @param mountPoint Mount point to remove
   */
  async removeMountFromWorkspace(mountPoint: MountPoint): Promise<void> {
    // Find the index of the mount in the workspace
    const index = this.findMountIndexInWorkspace(mountPoint.id);
    
    if (index < 0) {
      // Not in workspace, nothing to do
      return;
    }
    
    // Remove from workspace
    const success = vscode.workspace.updateWorkspaceFolders(index, 1);
    
    if (!success) {
      throw new Error(`Failed to remove mount ${mountPoint.id} from workspace`);
    }
    
    // Notify listeners
    this._onDidChangeMountWorkspaceState.fire(mountPoint);
  }
  
  /**
   * Update a mount in the workspace
   * @param mountPoint Mount point to update
   */
  async updateMountInWorkspace(mountPoint: MountPoint): Promise<void> {
    // Find the index of the mount in the workspace
    const index = this.findMountIndexInWorkspace(mountPoint.id);
    
    if (index < 0) {
      // Not in workspace, add it
      return this.addMountToWorkspace(mountPoint);
    }
    
    // Update the workspace folder
    // Note: VS Code doesn't provide a direct way to update workspace folder names,
    // so we need to remove and re-add it
    const success = vscode.workspace.updateWorkspaceFolders(
      index,
      1,
      { uri: mountPoint.uri, name: mountPoint.displayName }
    );
    
    if (!success) {
      throw new Error(`Failed to update mount ${mountPoint.id} in workspace`);
    }
    
    // Notify listeners
    this._onDidChangeMountWorkspaceState.fire(mountPoint);
  }
  
  /**
   * Check if a mount is in the workspace
   * @param mountId ID of the mount to check
   * @returns True if the mount is in the workspace
   */
  isMountInWorkspace(mountId: string): boolean {
    return this.findMountIndexInWorkspace(mountId) >= 0;
  }
  
  /**
   * Get all mount points that are currently in the workspace
   * @returns Array of mount IDs that are in the workspace
   */
  getMountsInWorkspace(): string[] {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    return workspaceFolders
      .filter(folder => folder.uri.scheme === 'ssh-mount')
      .map(folder => folder.uri.authority);
  }
  
  /**
   * Get the workspace folder for a mount point
   * @param mountId ID of the mount to find
   * @returns Workspace folder if found, undefined otherwise
   */
  getMountWorkspaceFolder(mountId: string): vscode.WorkspaceFolder | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    return workspaceFolders.find(
      folder => folder.uri.scheme === 'ssh-mount' && folder.uri.authority === mountId
    );
  }
  
  /**
   * Find the index of a mount in the workspace
   * @param mountId ID of the mount to find
   * @returns Index of the mount in the workspace, or -1 if not found
   */
  private findMountIndexInWorkspace(mountId: string): number {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    return workspaceFolders.findIndex(
      folder => folder.uri.scheme === 'ssh-mount' && folder.uri.authority === mountId
    );
  }
  
  /**
   * Reorder workspace folders to group mount points together
   * @param preferredPosition Position to place mount folders (start, end, or current)
   */
  async reorderWorkspaceFolders(preferredPosition: 'start' | 'end' | 'current' = 'end'): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length <= 1) {
      return; // Nothing to reorder
    }
    
    // Separate mount folders from other folders
    const mountFolders = workspaceFolders.filter(folder => folder.uri.scheme === 'ssh-mount');
    const otherFolders = workspaceFolders.filter(folder => folder.uri.scheme !== 'ssh-mount');
    
    if (mountFolders.length === 0 || otherFolders.length === 0) {
      return; // No mixing, nothing to reorder
    }
    
    // Determine the new order based on preferred position
    let newOrder: vscode.WorkspaceFolder[];
    
    switch (preferredPosition) {
      case 'start':
        newOrder = [...mountFolders, ...otherFolders];
        break;
      case 'end':
        newOrder = [...otherFolders, ...mountFolders];
        break;
      case 'current':
      default:
        return; // Keep current order
    }
    
    // Apply the new order
    // We need to remove all folders and add them back in the new order
    // This is a limitation of the VS Code API
    const success = vscode.workspace.updateWorkspaceFolders(0, workspaceFolders.length, 
      ...newOrder.map(folder => ({ uri: folder.uri, name: folder.name }))
    );
    
    if (!success) {
      throw new Error('Failed to reorder workspace folders');
    }
  }
}