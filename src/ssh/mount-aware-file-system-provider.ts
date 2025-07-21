import * as vscode from 'vscode';
import * as path from 'path';
import { MountAwareFileSystemProvider } from '../interfaces/filesystem';
import { MountPoint, MountStatus } from '../interfaces/mount';
import { RemoteFileSystemProviderImpl } from './remote-file-system-provider';
import { createFileSystemError, classifyAndCreateFileSystemError } from './error-classifier';
import { MountCacheManager, MountCacheConfig, DefaultMountCacheConfig } from './mount-cache-manager';
import { MountFileWatcher, MountFileWatcherConfig, DefaultMountFileWatcherConfig } from './mount-file-watcher';

/**
 * Implementation of MountAwareFileSystemProvider that extends RemoteFileSystemProviderImpl
 * to support mounted folders
 */
export class MountAwareFileSystemProviderImpl extends RemoteFileSystemProviderImpl implements MountAwareFileSystemProvider {
  private mountPoints: Map<string, MountPoint> = new Map();
  protected readonly _onDidChangeMountStatus = new vscode.EventEmitter<MountPoint>();
  readonly onDidChangeMountStatus: vscode.Event<MountPoint> = this._onDidChangeMountStatus.event;
  private mountCacheManager: MountCacheManager;
  private mountFileWatcher: MountFileWatcher;
  
  /**
   * Create a new MountAwareFileSystemProviderImpl
   * @param connectionManager SSH connection manager
   * @param cacheConfig Optional cache configuration
   * @param watcherConfig Optional file watcher configuration
   */
  constructor(
    connectionManager: any, 
    cacheConfig?: Partial<MountCacheConfig>,
    watcherConfig?: Partial<MountFileWatcherConfig>
  ) {
    super(connectionManager);
    this.mountCacheManager = new MountCacheManager(cacheConfig || DefaultMountCacheConfig);
    this.mountFileWatcher = new MountFileWatcher(this, watcherConfig);
    
    // Forward file change events from the watcher to our own event emitter
    this.mountFileWatcher.onDidChangeFile((events) => {
      const eventEmitter = (this as any)._onDidChangeFile;
      if (eventEmitter && typeof eventEmitter.fire === 'function') {
        eventEmitter.fire(events);
      }
    });
  }
  
  /**
   * Register a mount point with the file system provider
   * @param mountPoint Mount point to register
   */
  registerMountPoint(mountPoint: MountPoint): void {
    this.mountPoints.set(mountPoint.id, mountPoint);
    this.mountCacheManager.registerMountPoint(mountPoint);
    this.mountFileWatcher.registerMount(mountPoint);
  }
  
  /**
   * Unregister a mount point from the file system provider
   * @param mountId ID of the mount point to unregister
   */
  unregisterMountPoint(mountId: string): void {
    this.mountPoints.delete(mountId);
    this.mountCacheManager.unregisterMountPoint(mountId);
    this.mountFileWatcher.unregisterMount(mountId);
  }
  
  /**
   * Get the mount point for a URI
   * @param uri URI to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointForUri(uri: vscode.Uri): MountPoint | undefined {
    // Only handle ssh-mount scheme
    if (uri.scheme !== 'ssh-mount') {
      return undefined;
    }
    
    // Extract mount ID from authority
    const mountId = uri.authority;
    return this.mountPoints.get(mountId);
  }
  
  /**
   * Update the status of a mount point
   * @param mountId ID of the mount point to update
   * @param status New status
   */
  updateMountStatus(mountId: string, status: MountStatus): void {
    const mountPoint = this.mountPoints.get(mountId);
    if (mountPoint) {
      mountPoint.status = status;
      if (status === MountStatus.Connected) {
        mountPoint.lastConnected = new Date();
      }
      
      // Update file watcher with new status
      this.mountFileWatcher.updateMountStatus(mountId, status, mountPoint);
      
      this._onDidChangeMountStatus.fire(mountPoint);
    }
  }
  
  /**
   * Translate a mounted URI to a remote URI
   * @param uri Mounted URI (ssh-mount scheme)
   * @returns Remote URI (ssh scheme)
   * @throws FileSystemError if mount point is not found or not connected
   */
  translateMountedUriToRemoteUri(uri: vscode.Uri): vscode.Uri {
    // Only translate ssh-mount scheme
    if (uri.scheme !== 'ssh-mount') {
      return uri;
    }
    
    // Extract mount ID from authority
    const mountId = uri.authority;
    const mountPoint = this.mountPoints.get(mountId);
    
    if (!mountPoint) {
      throw createFileSystemError(
        'Unavailable',
        uri,
        `Mount point not found: ${mountId}`
      );
    }
    
    // Check if mount is connected
    if (mountPoint.status !== MountStatus.Connected) {
      throw createFileSystemError(
        'Unavailable',
        uri,
        `Mount point is not connected: ${mountPoint.displayName}. Current status: ${mountPoint.status}`
      );
    }
    
    // Combine remote path with relative path from mount
    const relativePath = uri.path;
    let remotePath: string;
    
    if (relativePath === '/' || relativePath === '') {
      // Root path, use mount path directly
      remotePath = mountPoint.remotePath;
    } else {
      // Combine mount path with relative path
      remotePath = path.posix.join(mountPoint.remotePath, relativePath);
    }
    
    // Create remote URI
    return vscode.Uri.parse(`ssh://${mountPoint.connectionId}${remotePath}`);
  }
  
  /**
   * Handle errors specific to mounted folders
   * @param error Original error
   * @param uri The URI that caused the error
   * @param operation Description of the operation being performed
   * @returns FileSystemError with mount-specific context
   */
  private handleMountError(error: Error, uri: vscode.Uri, operation: string): Error {
    // If it's already a FileSystemError, add mount-specific context
    if ((error as any).code && (error as any).uri) {
      const fsError = error as any;
      
      // Get mount point information for better error messages
      const mountPoint = this.getMountPointForUri(uri);
      if (mountPoint) {
        // Enhance error message with mount information
        const mountInfo = `[Mount: ${mountPoint.displayName}]`;
        fsError.message = `${mountInfo} ${fsError.message}`;
      }
      
      return error;
    }
    
    // Otherwise, classify and create a new FileSystemError with mount context
    const mountPoint = this.getMountPointForUri(uri);
    const mountContext = mountPoint ? ` on mount "${mountPoint.displayName}"` : '';
    
    return classifyAndCreateFileSystemError(
      error,
      uri,
      `${operation}${mountContext}`
    );
  }
  
  /**
   * Override readFile to handle mounted URIs
   * @param uri The URI of the file to read
   * @returns File content as Uint8Array
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === 'ssh-mount') {
      try {
        // Check cache first
        const cachedContent = this.mountCacheManager.getContent(uri);
        if (cachedContent) {
          return cachedContent;
        }
        
        // Not in cache, fetch from remote
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        const content = await super.readFile(remoteUri);
        
        // Cache the content
        this.mountCacheManager.setContent(uri, content);
        
        return content;
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'read file');
      }
    }
    return super.readFile(uri);
  }
  
  /**
   * Override writeFile to handle mounted URIs
   * @param uri The URI of the file to write
   * @param content The content to write
   * @param options Write options
   */
  async writeFile(
    uri: vscode.Uri, 
    content: Uint8Array, 
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    if (uri.scheme === 'ssh-mount') {
      try {
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        await super.writeFile(remoteUri, content, options);
        
        // Notify about the change in the mounted folder
        const mountPoint = this.getMountPointForUri(uri);
        if (mountPoint) {
          // Fire change event for the mounted URI as well
          this.notifyMountFileChanged(uri, vscode.FileChangeType.Changed);
        }
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'write file');
      }
    } else {
      return super.writeFile(uri, content, options);
    }
  }
  
  /**
   * Override readDirectory to handle mounted URIs
   * @param uri The URI of the directory to read
   * @returns Array of [name, type] pairs
   */
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    if (uri.scheme === 'ssh-mount') {
      try {
        // Check cache first
        const cachedEntries = this.mountCacheManager.getDirectory(uri);
        if (cachedEntries) {
          return cachedEntries;
        }
        
        // Not in cache, fetch from remote
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        const entries = await super.readDirectory(remoteUri);
        
        // Cache the directory entries
        this.mountCacheManager.setDirectory(uri, entries);
        
        return entries;
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'read directory');
      }
    }
    return super.readDirectory(uri);
  }
  
  /**
   * Override createDirectory to handle mounted URIs
   * @param uri The URI of the directory to create
   */
  async createDirectory(uri: vscode.Uri): Promise<void> {
    if (uri.scheme === 'ssh-mount') {
      try {
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        await super.createDirectory(remoteUri);
        
        // Notify about the change in the mounted folder
        const mountPoint = this.getMountPointForUri(uri);
        if (mountPoint) {
          // Fire change event for the mounted URI as well
          this.notifyMountFileChanged(uri, vscode.FileChangeType.Created);
          
          // Also invalidate the parent directory in the cache
          const parentUri = uri.with({ path: path.posix.dirname(uri.path) });
          this.invalidateCache(parentUri);
        }
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'create directory');
      }
    } else {
      return super.createDirectory(uri);
    }
  }
  
  /**
   * Override delete to handle mounted URIs
   * @param uri The URI of the file or directory to delete
   * @param options Delete options
   */
  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    if (uri.scheme === 'ssh-mount') {
      try {
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        await super.delete(remoteUri, options);
        
        // Notify about the change in the mounted folder
        const mountPoint = this.getMountPointForUri(uri);
        if (mountPoint) {
          // Fire change event for the mounted URI as well
          this.notifyMountFileChanged(uri, vscode.FileChangeType.Deleted);
          
          // Also invalidate the parent directory in the cache
          const parentUri = uri.with({ path: path.posix.dirname(uri.path) });
          this.invalidateCache(parentUri);
        }
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'delete');
      }
    } else {
      return super.delete(uri, options);
    }
  }
  
  /**
   * Override rename to handle mounted URIs
   * @param oldUri The URI of the file or directory to rename
   * @param newUri The new URI
   * @param options Rename options
   */
  async rename(
    oldUri: vscode.Uri, 
    newUri: vscode.Uri, 
    options: { overwrite: boolean }
  ): Promise<void> {
    try {
      // Handle different combinations of URI schemes
      if (oldUri.scheme === 'ssh-mount' && newUri.scheme === 'ssh-mount') {
        // Both URIs are mounted
        const oldMountPoint = this.getMountPointForUri(oldUri);
        const newMountPoint = this.getMountPointForUri(newUri);
        
        if (!oldMountPoint || !newMountPoint) {
          throw createFileSystemError(
            'Unavailable',
            oldUri,
            'Mount point not found'
          );
        }
        
        if (oldMountPoint.id !== newMountPoint.id) {
          // Cannot rename across different mount points
          throw createFileSystemError(
            'NoPermissions',
            oldUri,
            `Cannot rename across different mount points: from "${oldMountPoint.displayName}" to "${newMountPoint.displayName}"`
          );
        }
        
        const oldRemoteUri = this.translateMountedUriToRemoteUri(oldUri);
        const newRemoteUri = this.translateMountedUriToRemoteUri(newUri);
        await super.rename(oldRemoteUri, newRemoteUri, options);
        
        // Notify about the changes in the mounted folder
        this.notifyMountFileChanged(oldUri, vscode.FileChangeType.Deleted);
        this.notifyMountFileChanged(newUri, vscode.FileChangeType.Created);
        
        // Invalidate cache for both old and new parent directories
        const oldParentUri = oldUri.with({ path: path.posix.dirname(oldUri.path) });
        const newParentUri = newUri.with({ path: path.posix.dirname(newUri.path) });
        this.invalidateCache(oldParentUri);
        this.invalidateCache(newParentUri);
        
      } else if (oldUri.scheme === 'ssh-mount') {
        // Only old URI is mounted - cannot rename from mount to non-mount
        throw createFileSystemError(
          'NoPermissions',
          oldUri,
          'Cannot rename from a mounted folder to a non-mounted location'
        );
      } else if (newUri.scheme === 'ssh-mount') {
        // Only new URI is mounted - cannot rename from non-mount to mount
        throw createFileSystemError(
          'NoPermissions',
          newUri,
          'Cannot rename from a non-mounted location to a mounted folder'
        );
      } else {
        // Neither URI is mounted
        return super.rename(oldUri, newUri, options);
      }
    } catch (error) {
      // Handle mount-specific errors
      if (oldUri.scheme === 'ssh-mount') {
        throw this.handleMountError(error as Error, oldUri, 'rename');
      } else if (newUri.scheme === 'ssh-mount') {
        throw this.handleMountError(error as Error, newUri, 'rename to');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Override stat to handle mounted URIs
   * @param uri The URI to get stats for
   * @returns File stats
   */
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    if (uri.scheme === 'ssh-mount') {
      try {
        // Check cache first
        const cachedStat = this.mountCacheManager.getStat(uri);
        if (cachedStat) {
          return cachedStat;
        }
        
        // Not in cache, fetch from remote
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        const stat = await super.stat(remoteUri);
        
        // Cache the stat
        this.mountCacheManager.setStat(uri, stat);
        
        return stat;
      } catch (error) {
        throw this.handleMountError(error as Error, uri, 'get stats for');
      }
    }
    return super.stat(uri);
  }
  
  /**
   * Get cache statistics for mounted folders
   * @returns Cache statistics
   */
  getCacheStats(): any {
    return this.mountCacheManager.getStats();
  }
  
  /**
   * Override watch to handle mounted URIs
   * @param uri The URI to watch
   * @param options Watch options
   * @returns Disposable to stop watching
   */
  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
    if (uri.scheme === 'ssh-mount') {
      try {
        const mountPoint = this.getMountPointForUri(uri);
        
        // Check if file watching is enabled for this mount
        if (!mountPoint || !mountPoint.options.watchEnabled) {
          console.log(`File watching is disabled for mount ${mountPoint?.displayName || uri.authority}`);
          return { dispose: () => {} };
        }
        
        // Use our efficient mount file watcher for mounted folders
        return this.mountFileWatcher.watchDirectory(uri, options.recursive, 0, mountPoint);
      } catch (error) {
        // If the mount is not available, return a no-op disposable
        console.warn(`Failed to watch mounted URI ${uri}: ${error}`);
        return { dispose: () => {} };
      }
    }
    return super.watch(uri, options);
  }
  
  /**
   * Invalidate cache entries for a URI
   * @param uri The URI to invalidate in the cache
   */
  private invalidateCache(uri: vscode.Uri): void {
    if (uri.scheme === 'ssh-mount') {
      try {
        // Invalidate in mount cache manager
        this.mountCacheManager.invalidate(uri);
        
        // Also invalidate in parent cache if available
        const remoteUri = this.translateMountedUriToRemoteUri(uri);
        if (typeof (this as any).cacheManager?.invalidate === 'function') {
          (this as any).cacheManager.invalidate(remoteUri);
        }
      } catch (error) {
        console.warn(`Failed to invalidate cache for ${uri}: ${error}`);
      }
    }
  }
  
  /**
   * Notify about file changes in mounted folders
   * @param uri The URI that changed
   * @param type The type of change
   */
  private notifyMountFileChanged(uri: vscode.Uri, type: vscode.FileChangeType): void {
    // Use the public event emitter from the parent class
    const eventEmitter = (this as any)._onDidChangeFile;
    if (eventEmitter && typeof eventEmitter.fire === 'function') {
      // Fire the event for the mounted URI
      eventEmitter.fire([{ type, uri }]);
      
      // Also fire for the translated remote URI if different
      if (uri.scheme === 'ssh-mount') {
        try {
          const remoteUri = this.translateMountedUriToRemoteUri(uri);
          if (remoteUri.toString() !== uri.toString()) {
            eventEmitter.fire([{ type, uri: remoteUri }]);
          }
        } catch (error) {
          // Ignore translation errors for notifications
          console.warn('Failed to translate URI for file change notification:', error);
        }
      }
    }
  }
}