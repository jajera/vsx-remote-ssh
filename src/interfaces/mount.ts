<<<<<<< HEAD
/**
 * Mount interfaces for remote folder mounting functionality
 */
import * as vscode from 'vscode';
import { SSHConnection } from './ssh';
import { TerminalOptions } from './terminal';

/**
 * Mount point configuration
 */
export interface MountPoint {
  id: string;
  name: string;
  connectionId: string;
  remotePath: string;
  mountPath: string;
  options: MountOptions;
  isActive: boolean;
  lastActivity: Date;
}

/**
 * Mount options
 */
export interface MountOptions {
  readOnly: boolean;
  autoReconnect: boolean;
  cacheEnabled: boolean;
  cacheTTL: number;
  watchEnabled: boolean;
  watchExcludes: string[];
}

/**
 * Mount manager interface
 */
export interface MountManager {
  getMounts(): MountPoint[];
  getMountById(id: string): MountPoint | undefined;
  getMountByUri(uri: vscode.Uri): MountPoint | undefined;
  addMount(connectionId: string, remotePath: string, name?: string, options?: Partial<MountOptions>): Promise<MountPoint>;
  removeMount(mountId: string): Promise<boolean>;
  updateMount(mountId: string, updates: Partial<MountPoint>): Promise<MountPoint | undefined>;
  translateUri(uri: vscode.Uri): vscode.Uri | undefined;
  getMountUri(mountPoint: MountPoint): vscode.Uri;
  getRemoteUri(mountPoint: MountPoint): vscode.Uri;
}

/**
 * Mount-aware terminal options
 */
export interface MountTerminalOptions extends TerminalOptions {
  mountId?: string;
  useWorkingDirectory?: boolean;
}

/**
 * Mount-aware terminal provider interface
 */
export interface MountAwareTerminalProvider {
  createTerminalForMount(mountId: string, options?: MountTerminalOptions): Promise<vscode.Terminal>;
  getTerminalsForMount(mountId: string): vscode.Terminal[];
  resolveWorkingDirectory(mountId: string, relativePath?: string): Promise<string>;
=======
import * as vscode from 'vscode';
import { SSHConnection } from './ssh';

/**
 * Status of a mount point
 */
export enum MountStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Error = 'error'
}

/**
 * Options for a mount point
 */
export interface MountOptions {
  autoReconnect: boolean;     // Whether to automatically reconnect
  cacheEnabled: boolean;      // Whether caching is enabled
  watchEnabled: boolean;      // Whether file watching is enabled
  watchExcludePatterns: string[]; // Patterns to exclude from watching
}

/**
 * Represents a mounted remote folder
 */
export interface MountPoint {
  id: string;                 // Unique identifier for the mount
  connectionId: string;       // ID of the SSH connection
  remotePath: string;         // Path on the remote server
  displayName: string;        // Display name in the explorer
  uri: vscode.Uri;            // URI for accessing the mount
  status: MountStatus;        // Current status of the mount
  lastConnected: Date;        // Last successful connection time
  options: MountOptions;      // Mount-specific options
}

/**
 * Interface for managing remote folder mounts
 */
export interface MountManager {
  /**
   * Mount a remote folder
   * @param connection SSH connection
   * @param remotePath Path on the remote server
   * @param displayName Optional display name (defaults to last part of path)
   * @returns The created mount point
   */
  mountRemoteFolder(connection: SSHConnection, remotePath: string, displayName?: string): Promise<MountPoint>;
  
  /**
   * Unmount a remote folder
   * @param mountId ID of the mount to unmount
   */
  unmountFolder(mountId: string): Promise<void>;
  
  /**
   * Get all mount points
   * @returns Array of mount points
   */
  getMountPoints(): MountPoint[];
  
  /**
   * Get a mount point by URI
   * @param uri URI to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointByUri(uri: vscode.Uri): MountPoint | undefined;
  
  /**
   * Get a mount point by ID
   * @param id Mount ID to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointById(id: string): MountPoint | undefined;
  
  /**
   * Restore mounts from saved state
   * @returns Promise that resolves when all mounts are restored
   */
  restoreMounts(): Promise<void>;
  
  /**
   * Update the status of a mount point
   * @param mountId ID of the mount to update
   * @param status New status
   */
  updateMountStatus(mountId: string, status: MountStatus): void;
  
  /**
   * Configure options for a mount point
   * @param mountId ID of the mount to configure
   * @returns Updated mount point if options were changed, undefined if cancelled
   */
  configureMountOptions(mountId: string): Promise<MountPoint | undefined>;
  
  /**
   * Update options for a mount point
   * @param mountId ID of the mount to update
   * @param options New options
   * @returns Updated mount point
   */
  updateMountOptions(mountId: string, options: MountOptions): Promise<MountPoint>;
  
  /**
   * Event that fires when mount points change
   */
  onDidChangeMountPoints: vscode.Event<MountPoint[]>;
}

/**
 * Interface for persisting mount state
 */
export interface MountStatePersistence {
  /**
   * Save mount points to persistent storage
   * @param mountPoints Mount points to save
   */
  saveMountPoints(mountPoints: MountPoint[]): Promise<void>;
  
  /**
   * Load mount points from persistent storage
   * @returns Loaded mount points
   */
  loadMountPoints(): Promise<MountPoint[]>;
  
  /**
   * Clear all saved mount points
   */
  clearMountPoints(): Promise<void>;
}

/**
 * Interface for integrating mounts with VS Code workspace
 */
export interface WorkspaceIntegration {
  /**
   * Add a mount to the workspace
   * @param mountPoint Mount point to add
   */
  addMountToWorkspace(mountPoint: MountPoint): Promise<void>;
  
  /**
   * Remove a mount from the workspace
   * @param mountPoint Mount point to remove
   */
  removeMountFromWorkspace(mountPoint: MountPoint): Promise<void>;
  
  /**
   * Update a mount in the workspace
   * @param mountPoint Mount point to update
   */
  updateMountInWorkspace(mountPoint: MountPoint): Promise<void>;
  
  /**
   * Check if a mount is in the workspace
   * @param mountId ID of the mount to check
   * @returns True if the mount is in the workspace
   */
  isMountInWorkspace(mountId: string): boolean;
>>>>>>> 3679f3c (feat: add remote folder mount feature)
}