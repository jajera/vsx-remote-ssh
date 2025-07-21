import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MountManager, MountPoint, MountStatus, MountOptions, MountStatePersistence, WorkspaceIntegration } from '../interfaces/mount';
import { SSHConnection, SSHConnectionManager } from '../interfaces/ssh';
import { MountAwareFileSystemProvider } from '../interfaces/filesystem';
import { MountOptionsManager, DefaultMountOptions } from './mount-options-manager';
import { ReconnectionHandler } from './reconnection-handler';

/**
 * Implementation of MountManager for managing remote folder mounts
 */
export class MountManagerImpl implements MountManager {
  private mountPoints: Map<string, MountPoint> = new Map();
  private connectionManager: SSHConnectionManager;
  private persistence: MountStatePersistence;
  private workspaceIntegration: WorkspaceIntegration;
  private fileSystemProvider?: MountAwareFileSystemProvider;
  private optionsManager?: MountOptionsManager;
  private reconnectionHandler?: ReconnectionHandler;
  private readonly _onDidChangeMountPoints = new vscode.EventEmitter<MountPoint[]>();
  
  readonly onDidChangeMountPoints: vscode.Event<MountPoint[]> = this._onDidChangeMountPoints.event;
  
  constructor(
    connectionManager: SSHConnectionManager,
    persistence: MountStatePersistence,
    workspaceIntegration: WorkspaceIntegration,
    fileSystemProvider?: MountAwareFileSystemProvider,
    optionsManager?: MountOptionsManager
  ) {
    this.connectionManager = connectionManager;
    this.persistence = persistence;
    this.workspaceIntegration = workspaceIntegration;
    this.fileSystemProvider = fileSystemProvider;
    this.optionsManager = optionsManager;
    
    // Note: Connection status changes will be handled by the connection manager
    // when it implements proper event emission
  }
  
  /**
   * Handle connection status changes
   * @param connectionId ID of the connection
   * @param status New status
   */
  private handleConnectionStatusChanged(connectionId: string, status: string): void {
    // Update mount statuses based on connection status
    this.updateMountStatusesBasedOnConnections();
  }
  
  /**
   * Mount a remote folder
   * @param connection SSH connection
   * @param remotePath Path on the remote server
   * @param displayName Optional display name (defaults to last part of path)
   * @returns The created mount point
   */
  async mountRemoteFolder(
    connection: SSHConnection,
    remotePath: string,
    displayName?: string
  ): Promise<MountPoint> {
    // Normalize remote path
    if (!remotePath.startsWith('/')) {
      remotePath = '/' + remotePath;
    }
    
    // Generate a unique ID for the mount
    const mountId = uuidv4();
    
    // Use the last part of the path as the display name if not provided
    if (!displayName) {
      displayName = path.posix.basename(remotePath);
      if (!displayName) {
        displayName = remotePath;
      }
    }
    
    // Create the mount point
    const mountPoint: MountPoint = {
      id: mountId,
      connectionId: connection.id,
      remotePath,
      displayName,
      uri: vscode.Uri.parse(`ssh-mount://${mountId}/`),
      status: MountStatus.Connected,
      lastConnected: new Date(),
      options: { ...DefaultMountOptions }
    };
    
    // Add to the map
    this.mountPoints.set(mountId, mountPoint);
    
    // Register with file system provider if available
    if (this.fileSystemProvider) {
      this.fileSystemProvider.registerMountPoint(mountPoint);
    }
    
    // Add to workspace
    await this.workspaceIntegration.addMountToWorkspace(mountPoint);
    
    // Save mount points
    await this.persistence.saveMountPoints(Array.from(this.mountPoints.values()));
    
    // Notify listeners
    this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
    
    return mountPoint;
  }
  
  /**
   * Unmount a remote folder
   * @param mountId ID of the mount to unmount
   */
  async unmountFolder(mountId: string): Promise<void> {
    const mountPoint = this.mountPoints.get(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point not found: ${mountId}`);
    }
    
    // Remove from workspace
    await this.workspaceIntegration.removeMountFromWorkspace(mountPoint);
    
    // Unregister from file system provider if available
    if (this.fileSystemProvider) {
      this.fileSystemProvider.unregisterMountPoint(mountId);
    }
    
    // Remove from map
    this.mountPoints.delete(mountId);
    
    // Save mount points
    await this.persistence.saveMountPoints(Array.from(this.mountPoints.values()));
    
    // Notify listeners
    this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
  }
  
  /**
   * Get all mount points
   * @returns Array of mount points
   */
  getMountPoints(): MountPoint[] {
    return Array.from(this.mountPoints.values());
  }
  
  /**
   * Get a mount point by URI
   * @param uri URI to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointByUri(uri: vscode.Uri): MountPoint | undefined {
    // Check if this is a mount URI
    if (uri.scheme !== 'ssh-mount') {
      return undefined;
    }
    
    // Extract mount ID from authority
    const mountId = uri.authority;
    return this.getMountPointById(mountId);
  }
  
  /**
   * Get a mount point by ID
   * @param id Mount ID to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointById(id: string): MountPoint | undefined {
    return this.mountPoints.get(id);
  }
  
  /**
   * Restore mounts from saved state
   * @returns Promise that resolves when all mounts are restored
   */
  async restoreMounts(): Promise<void> {
    try {
      // Load saved mount points
      const savedMountPoints = await this.persistence.loadMountPoints();
      
      // Clear existing mount points
      this.mountPoints.clear();
      
      // Restore each mount point
      for (const mountPoint of savedMountPoints) {
        // Set initial status to disconnected
        mountPoint.status = MountStatus.Disconnected;
        
        // Add to map
        this.mountPoints.set(mountPoint.id, mountPoint);
        
        // Register with file system provider if available
        if (this.fileSystemProvider) {
          this.fileSystemProvider.registerMountPoint(mountPoint);
        }
        
        // Add to workspace
        try {
          await this.workspaceIntegration.addMountToWorkspace(mountPoint);
        } catch (error) {
          console.error(`Failed to add mount ${mountPoint.id} to workspace:`, error);
        }
        
        // Try to reconnect if the connection is available
        try {
          const connection = this.connectionManager.getConnection(mountPoint.connectionId);
          if (connection && connection.status === 'connected') {
            this.updateMountStatus(mountPoint.id, MountStatus.Connected);
            mountPoint.lastConnected = new Date();
          }
        } catch (error) {
          console.error(`Failed to reconnect mount ${mountPoint.id}:`, error);
        }
      }
      
      // Notify listeners
      this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
    } catch (error) {
      console.error('Failed to restore mounts:', error);
    }
  }
  
  /**
   * Update the status of a mount point
   * @param mountId ID of the mount to update
   * @param status New status
   */
  updateMountStatus(mountId: string, status: MountStatus): void {
    const mountPoint = this.mountPoints.get(mountId);
    if (!mountPoint) {
      return;
    }
    
    // Update status
    mountPoint.status = status;
    
    // Update last connected time if connected
    if (status === MountStatus.Connected) {
      mountPoint.lastConnected = new Date();
    }
    
    // Notify listeners
    this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
  }
  
  /**
   * Configure options for a mount point
   * @param mountId ID of the mount to configure
   * @returns Updated mount point if options were changed, undefined if cancelled
   */
  async configureMountOptions(mountId: string): Promise<MountPoint | undefined> {
    // Check if options manager is available
    if (!this.optionsManager) {
      throw new Error('Options manager not available');
    }
    
    // Get mount point
    const mountPoint = this.mountPoints.get(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point not found: ${mountId}`);
    }
    
    // Show options UI
    const updatedOptions = await this.optionsManager.showOptionsUI(mountPoint);
    if (!updatedOptions) {
      // User cancelled
      return undefined;
    }
    
    // Update mount point with new options
    return this.updateMountOptions(mountId, updatedOptions);
  }
  
  /**
   * Update options for a mount point
   * @param mountId ID of the mount to update
   * @param options New options
   * @returns Updated mount point
   */
  async updateMountOptions(mountId: string, options: MountOptions): Promise<MountPoint> {
    // Get mount point
    const mountPoint = this.mountPoints.get(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point not found: ${mountId}`);
    }
    
    // Update options
    mountPoint.options = { ...options };
    
    // Save mount points
    await this.persistence.saveMountPoints(Array.from(this.mountPoints.values()));
    
    // Update file system provider if available
    if (this.fileSystemProvider) {
      this.fileSystemProvider.registerMountPoint(mountPoint);
    }
    
    // Notify listeners
    this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
    
    return mountPoint;
  }

  /**
   * Update mount statuses based on connection statuses
   */
  private updateMountStatusesBasedOnConnections(): void {
    let changed = false;
    
    // Check each mount point
    for (const mountPoint of this.mountPoints.values()) {
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      
      if (!connection) {
        // Connection not found
        if (mountPoint.status !== MountStatus.Disconnected) {
          mountPoint.status = MountStatus.Disconnected;
          changed = true;
        }
      } else if (connection.status === 'connected') {
        // Connection is active
        if (mountPoint.status !== MountStatus.Connected) {
          mountPoint.status = MountStatus.Connected;
          mountPoint.lastConnected = new Date();
          changed = true;
        }
      } else {
        // Connection is not active
        if (mountPoint.status !== MountStatus.Disconnected) {
          mountPoint.status = MountStatus.Disconnected;
          changed = true;
        }
      }
    }
    
    // Notify listeners if any statuses changed
    if (changed) {
      this._onDidChangeMountPoints.fire(Array.from(this.mountPoints.values()));
    }
  }
}