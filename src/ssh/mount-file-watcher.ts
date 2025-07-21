import * as vscode from 'vscode';
import * as path from 'path';
import { MountPoint, MountStatus } from '../interfaces/mount';

/**
 * Configuration for mount file watching
 */
export interface MountFileWatcherConfig {
  /**
   * Maximum number of directories to watch per mount
   */
  maxWatchedDirectories: number;
  
  /**
   * Interval for polling changes in milliseconds
   */
  pollingInterval: number;
  
  /**
   * Whether to use recursive watching
   */
  useRecursiveWatching: boolean;
  
  /**
   * Maximum depth for recursive watching
   */
  maxRecursiveDepth: number;
  
  /**
   * Batch update delay in milliseconds
   */
  batchUpdateDelay: number;
  
  /**
   * Default exclude patterns
   */
  defaultExcludePatterns: string[];
}

/**
 * Default configuration for mount file watching
 */
export const DefaultMountFileWatcherConfig: MountFileWatcherConfig = {
  maxWatchedDirectories: 50,
  pollingInterval: 5000,
  useRecursiveWatching: true,
  maxRecursiveDepth: 3,
  batchUpdateDelay: 300,
  defaultExcludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.log'
  ]
};

/**
 * Interface for a file watcher
 */
interface FileWatcher {
  uri: vscode.Uri;
  disposable: vscode.Disposable;
  recursive: boolean;
  depth: number;
  lastAccessed: Date;
}

/**
 * Batched file change event
 */
interface BatchedFileChangeEvent {
  changes: vscode.FileChangeEvent[];
  timer: NodeJS.Timeout;
}

/**
 * Mount file watcher that implements efficient file watching for remote mounts
 */
export class MountFileWatcher {
  private watchers: Map<string, Map<string, FileWatcher>> = new Map();
  private batchedEvents: Map<string, BatchedFileChangeEvent> = new Map();
  private config: MountFileWatcherConfig;
  private fileSystemProvider: vscode.FileSystemProvider;
  
  private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;
  
  /**
   * Create a new MountFileWatcher
   * @param fileSystemProvider File system provider to use for watching
   * @param config Configuration for file watching
   */
  constructor(
    fileSystemProvider: vscode.FileSystemProvider,
    config: Partial<MountFileWatcherConfig> = {}
  ) {
    this.fileSystemProvider = fileSystemProvider;
    this.config = {
      ...DefaultMountFileWatcherConfig,
      ...config
    };
  }
  
  /**
   * Register a mount point for file watching
   * @param mountPoint Mount point to register
   */
  registerMount(mountPoint: MountPoint): void {
    // Create a new map for this mount if it doesn't exist
    if (!this.watchers.has(mountPoint.id)) {
      this.watchers.set(mountPoint.id, new Map());
    }
    
    // If the mount is connected, watch the root directory
    if (mountPoint.status === MountStatus.Connected && mountPoint.options.watchEnabled) {
      this.watchDirectory(mountPoint.uri, true, 0, mountPoint);
    }
  }
  
  /**
   * Unregister a mount point from file watching
   * @param mountId ID of the mount to unregister
   */
  unregisterMount(mountId: string): void {
    const mountWatchers = this.watchers.get(mountId);
    if (mountWatchers) {
      // Dispose all watchers for this mount
      for (const watcher of mountWatchers.values()) {
        watcher.disposable.dispose();
      }
      
      // Clear the map
      mountWatchers.clear();
      this.watchers.delete(mountId);
    }
    
    // Clear any batched events for this mount
    const batchedEvent = this.batchedEvents.get(mountId);
    if (batchedEvent) {
      clearTimeout(batchedEvent.timer);
      this.batchedEvents.delete(mountId);
    }
  }
  
  /**
   * Update mount status
   * @param mountId ID of the mount to update
   * @param status New status
   * @param mountPoint Optional mount point object
   */
  updateMountStatus(mountId: string, status: MountStatus, mountPoint?: MountPoint): void {
    // If the mount is now connected, start watching
    if (status === MountStatus.Connected) {
      if (mountPoint && mountPoint.options.watchEnabled) {
        this.watchDirectory(mountPoint.uri, true, 0, mountPoint);
      }
    } else {
      // If the mount is disconnected, stop watching
      const mountWatchers = this.watchers.get(mountId);
      if (mountWatchers) {
        for (const watcher of mountWatchers.values()) {
          watcher.disposable.dispose();
        }
        mountWatchers.clear();
      }
    }
  }
  
  /**
   * Watch a directory for changes
   * @param uri URI of the directory to watch
   * @param recursive Whether to watch recursively
   * @param depth Current depth (for recursive watching)
   * @param mountPoint Mount point the directory belongs to
   * @returns Disposable for the watcher
   */
  watchDirectory(
    uri: vscode.Uri,
    recursive: boolean,
    depth: number,
    mountPoint: MountPoint
  ): vscode.Disposable {
    const mountWatchers = this.watchers.get(mountPoint.id);
    if (!mountWatchers) {
      throw new Error(`Mount ${mountPoint.id} not registered for watching`);
    }
    
    // Check if we're already watching this directory
    const key = uri.toString();
    const existingWatcher = mountWatchers.get(key);
    if (existingWatcher) {
      // Update last accessed time
      existingWatcher.lastAccessed = new Date();
      return existingWatcher.disposable;
    }
    
    // Check if we've reached the maximum number of watched directories
    if (mountWatchers.size >= this.config.maxWatchedDirectories) {
      // Find the least recently accessed watcher to replace
      let leastRecentWatcher: FileWatcher | undefined;
      let leastRecentKey: string | undefined;
      
      for (const [watcherKey, watcher] of mountWatchers.entries()) {
        if (!leastRecentWatcher || watcher.lastAccessed < leastRecentWatcher.lastAccessed) {
          leastRecentWatcher = watcher;
          leastRecentKey = watcherKey;
        }
      }
      
      // Dispose the least recently accessed watcher
      if (leastRecentWatcher && leastRecentKey) {
        leastRecentWatcher.disposable.dispose();
        mountWatchers.delete(leastRecentKey);
      }
    }
    
    // Combine exclude patterns from mount options and defaults
    const excludePatterns = [
      ...this.config.defaultExcludePatterns,
      ...(mountPoint.options.watchExcludePatterns || [])
    ];
    
    // Create a new watcher
    const watchOptions = {
      recursive: recursive && this.config.useRecursiveWatching,
      excludes: excludePatterns
    };
    
    try {
      // Create the watcher using the file system provider
      const disposable = this.fileSystemProvider.watch(uri, watchOptions);
      
      // Create a wrapper that handles our own events
      const wrapperDisposable = {
        dispose: () => {
          disposable.dispose();
        }
      };
      
      // Store the watcher
      const watcher: FileWatcher = {
        uri,
        disposable: wrapperDisposable,
        recursive: recursive && this.config.useRecursiveWatching,
        depth,
        lastAccessed: new Date()
      };
      
      mountWatchers.set(key, watcher);
      
      // If we're not using recursive watching but want to watch recursively,
      // we need to manually watch subdirectories
      if (recursive && !this.config.useRecursiveWatching && depth < this.config.maxRecursiveDepth) {
        this.watchSubdirectories(uri, depth + 1, mountPoint);
      }
      
      return wrapperDisposable;
    } catch (error) {
      console.error(`Failed to watch directory ${uri}:`, error);
      return { dispose: () => {} };
    }
  }
  
  /**
   * Watch subdirectories of a directory
   * @param parentUri URI of the parent directory
   * @param depth Current depth
   * @param mountPoint Mount point the directory belongs to
   */
  private async watchSubdirectories(
    parentUri: vscode.Uri,
    depth: number,
    mountPoint: MountPoint
  ): Promise<void> {
    try {
      // Read the directory
      const entries = await (this.fileSystemProvider as any).readDirectory(parentUri);
      
      // Watch each subdirectory
      for (const [name, type] of entries) {
        if (type === vscode.FileType.Directory) {
          const subdirUri = vscode.Uri.parse(parentUri.toString() + '/' + name);
          
          // Check if this directory should be excluded
          if (this.shouldExclude(subdirUri.path, mountPoint.options.watchExcludePatterns)) {
            continue;
          }
          
          // Watch the subdirectory
          this.watchDirectory(subdirUri, true, depth, mountPoint);
        }
      }
    } catch (error) {
      console.error(`Failed to watch subdirectories of ${parentUri}:`, error);
    }
  }
  
  /**
   * Check if a path should be excluded based on patterns
   * @param path Path to check
   * @param excludePatterns Patterns to exclude
   * @returns True if the path should be excluded
   */
  private shouldExclude(path: string, excludePatterns: string[]): boolean {
    // Normalize path for matching
    const normalizedPath = path.replace(/\\/g, '/');
    
    // Check each pattern
    for (const pattern of excludePatterns) {
      // Convert glob pattern to regex
      const regexPattern = this.globToRegExp(pattern);
      if (regexPattern.test(normalizedPath)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Convert a glob pattern to a regular expression
   * @param pattern Glob pattern
   * @returns Regular expression
   */
  private globToRegExp(pattern: string): RegExp {
    // Escape regex special characters except * and ?
    let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    
    // Convert glob * to regex .*
    regexPattern = regexPattern.replace(/\*/g, '.*');
    
    // Convert glob ? to regex .
    regexPattern = regexPattern.replace(/\?/g, '.');
    
    // Handle ** for recursive matching
    regexPattern = regexPattern.replace(/\*\*\//g, '(.*\/)?');
    
    return new RegExp(`^${regexPattern}$`);
  }
  
  /**
   * Handle file change events
   * @param mountId ID of the mount
   * @param events File change events
   */
  handleFileChanges(mountId: string, events: vscode.FileChangeEvent[]): void {
    // Get the batched event for this mount
    let batchedEvent = this.batchedEvents.get(mountId);
    
    if (!batchedEvent) {
      // Create a new batched event
      batchedEvent = {
        changes: [],
        timer: setTimeout(() => {
          this.flushBatchedEvents(mountId);
        }, this.config.batchUpdateDelay)
      };
      
      this.batchedEvents.set(mountId, batchedEvent);
    }
    
    // Add the events to the batch
    batchedEvent.changes.push(...events);
    
    // Reset the timer
    clearTimeout(batchedEvent.timer);
    batchedEvent.timer = setTimeout(() => {
      this.flushBatchedEvents(mountId);
    }, this.config.batchUpdateDelay);
  }
  
  /**
   * Flush batched events for a mount
   * @param mountId ID of the mount
   */
  private flushBatchedEvents(mountId: string): void {
    const batchedEvent = this.batchedEvents.get(mountId);
    if (!batchedEvent) {
      return;
    }
    
    // Remove the batched event
    this.batchedEvents.delete(mountId);
    
    // Deduplicate events
    const deduplicatedEvents = this.deduplicateEvents(batchedEvent.changes);
    
    // Fire the event
    this._onDidChangeFile.fire(deduplicatedEvents);
  }
  
  /**
   * Deduplicate file change events
   * @param events Events to deduplicate
   * @returns Deduplicated events
   */
  private deduplicateEvents(events: vscode.FileChangeEvent[]): vscode.FileChangeEvent[] {
    // Map to track the latest event for each URI
    const latestEvents = new Map<string, vscode.FileChangeEvent>();
    
    // Process events in order
    for (const event of events) {
      const key = event.uri.toString();
      const existingEvent = latestEvents.get(key);
      
      if (!existingEvent) {
        // No existing event, add this one
        latestEvents.set(key, event);
      } else {
        // There's an existing event, determine which one to keep
        
        // If the existing event is a deletion, it takes precedence
        if (existingEvent.type === vscode.FileChangeType.Deleted) {
          continue;
        }
        
        // If the new event is a deletion, it takes precedence
        if (event.type === vscode.FileChangeType.Deleted) {
          latestEvents.set(key, event);
          continue;
        }
        
        // If the existing event is a creation and the new one is a change,
        // keep the creation event
        if (existingEvent.type === vscode.FileChangeType.Created &&
            event.type === vscode.FileChangeType.Changed) {
          continue;
        }
        
        // Otherwise, use the new event
        latestEvents.set(key, event);
      }
    }
    
    // Convert map back to array
    return Array.from(latestEvents.values());
  }
  
  /**
   * Refresh watching for a directory
   * @param uri URI of the directory to refresh
   * @param mountPoint Mount point the directory belongs to
   */
  async refreshWatching(uri: vscode.Uri, mountPoint: MountPoint): Promise<void> {
    const mountWatchers = this.watchers.get(mountPoint.id);
    if (!mountWatchers) {
      return;
    }
    
    // Get the watcher for this URI
    const key = uri.toString();
    const watcher = mountWatchers.get(key);
    
    if (watcher) {
      // Dispose the existing watcher
      watcher.disposable.dispose();
      mountWatchers.delete(key);
      
      // Create a new watcher
      this.watchDirectory(uri, watcher.recursive, watcher.depth, mountPoint);
      
      // If this is a directory and we're watching recursively, refresh subdirectories
      if (watcher.recursive && watcher.depth < this.config.maxRecursiveDepth) {
        await this.watchSubdirectories(uri, watcher.depth + 1, mountPoint);
      }
    }
  }
  
  /**
   * Get statistics about file watching
   * @returns Statistics object
   */
  getStats(): any {
    const stats: any = {
      mountCount: this.watchers.size,
      totalWatcherCount: 0,
      watchersByMount: {}
    };
    
    // Count watchers for each mount
    for (const [mountId, mountWatchers] of this.watchers.entries()) {
      stats.totalWatcherCount += mountWatchers.size;
      stats.watchersByMount[mountId] = mountWatchers.size;
    }
    
    return stats;
  }
  
  /**
   * Dispose all watchers
   */
  dispose(): void {
    // Dispose all watchers
    for (const mountWatchers of this.watchers.values()) {
      for (const watcher of mountWatchers.values()) {
        watcher.disposable.dispose();
      }
    }
    
    // Clear maps
    this.watchers.clear();
    
    // Clear batched events
    for (const batchedEvent of this.batchedEvents.values()) {
      clearTimeout(batchedEvent.timer);
    }
    this.batchedEvents.clear();
  }
}