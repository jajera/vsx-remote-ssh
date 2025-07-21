import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemCacheManager, FileSystemCacheConfig, DefaultCacheConfig } from './file-system-cache-manager';
import { MountPoint } from '../interfaces/mount';

/**
 * Mount-specific cache configuration
 */
export interface MountCacheConfig extends FileSystemCacheConfig {
  /**
   * Whether to enable hierarchical caching for mounted folders
   */
  hierarchicalCaching: boolean;
  
  /**
   * Whether to prefetch directory contents for better browsing experience
   */
  prefetchDirectories: boolean;
  
  /**
   * Maximum depth for prefetching directories
   */
  prefetchDepth: number;
  
  /**
   * Whether to cache file metadata separately from directory listings
   */
  cacheMetadata: boolean;
  
  /**
   * Timeout for metadata cache entries in milliseconds
   */
  metadataCacheTimeout: number;
}

/**
 * Default mount cache configuration
 */
export const DefaultMountCacheConfig: MountCacheConfig = {
  ...DefaultCacheConfig,
  hierarchicalCaching: true,
  prefetchDirectories: true,
  prefetchDepth: 1,
  cacheMetadata: true,
  metadataCacheTimeout: 300000 // 5 minutes
};

/**
 * Cache manager for mounted folders with enhanced caching strategies
 */
export class MountCacheManager extends FileSystemCacheManager {
  private mountPoints: Map<string, MountPoint> = new Map();
  private metadataCache: Map<string, { metadata: any, timestamp: number }> = new Map();
  private mountConfig: MountCacheConfig;
  
  // Additional cache statistics
  private mountStats = {
    prefetchCount: 0,
    metadataHits: 0,
    metadataMisses: 0,
    hierarchicalInvalidations: 0
  };
  
  constructor(config: Partial<MountCacheConfig> = {}) {
    super(config);
    
    this.mountConfig = {
      hierarchicalCaching: true,
      prefetchDirectories: true,
      prefetchDepth: 2,
      cacheMetadata: true,
      metadataCacheTimeout: 300000, // 5 minutes
      maxAge: 300000, // 5 minutes
      maxEntries: 1000,
      cacheDirectories: true,
      cacheStats: true,
      cacheContents: false,
      maxContentSize: 1024 * 1024, // 1MB,
      ...config
    };
  }
  
  /**
   * Register a mount point with the cache manager
   * @param mountPoint Mount point to register
   */
  registerMountPoint(mountPoint: MountPoint): void {
    this.mountPoints.set(mountPoint.id, mountPoint);
  }
  
  /**
   * Unregister a mount point from the cache manager
   * @param mountId ID of the mount point to unregister
   */
  unregisterMountPoint(mountId: string): void {
    this.mountPoints.delete(mountId);
    this.invalidateMount(mountId);
  }
  
  /**
   * Get mount point by ID
   * @param mountId ID of the mount point
   * @returns Mount point if found, undefined otherwise
   */
  getMountPoint(mountId: string): MountPoint | undefined {
    return this.mountPoints.get(mountId);
  }
  
  /**
   * Get mount ID from URI
   * @param uri URI to extract mount ID from
   * @returns Mount ID if URI is a mount URI, undefined otherwise
   */
  private getMountIdFromUri(uri: vscode.Uri): string | undefined {
    if (uri.scheme === 'ssh-mount') {
      return uri.authority;
    }
    return undefined;
  }
  
  /**
   * Check if caching is enabled for a mount
   * @param uri URI to check
   * @returns Whether caching is enabled
   */
  private isCachingEnabled(uri: vscode.Uri): boolean {
    const mountId = this.getMountIdFromUri(uri);
    if (!mountId) {
      return true; // Default to enabled for non-mount URIs
    }
    
    const mountPoint = this.mountPoints.get(mountId);
    return mountPoint ? mountPoint.options.cacheEnabled : true;
  }
  
  /**
   * Get file stat from cache or return null if not found
   * Override to check mount-specific caching settings
   * @param uri The URI to get stats for
   * @returns File stat or null if not in cache
   */
  override getStat(uri: vscode.Uri): vscode.FileStat | null {
    if (!this.isCachingEnabled(uri)) {
      return null;
    }
    return super.getStat(uri);
  }
  
  /**
   * Store file stat in cache
   * Override to check mount-specific caching settings
   * @param uri The URI of the file
   * @param stat The file stat to cache
   */
  override setStat(uri: vscode.Uri, stat: vscode.FileStat): void {
    if (!this.isCachingEnabled(uri)) {
      return;
    }
    super.setStat(uri, stat);
  }
  
  /**
   * Get directory listing from cache or return null if not found
   * Override to check mount-specific caching settings
   * @param uri The URI of the directory
   * @returns Directory listing or null if not in cache
   */
  override getDirectory(uri: vscode.Uri): [string, vscode.FileType][] | null {
    if (!this.isCachingEnabled(uri)) {
      return null;
    }
    return super.getDirectory(uri);
  }
  
  /**
   * Store directory entries in cache
   * Override to add metadata caching
   * @param uri The URI of the directory
   * @param entries The directory entries to cache
   */
  override setDirectory(uri: vscode.Uri, entries: [string, vscode.FileType][]): void {
    if (!this.isCachingEnabled(uri)) {
      return;
    }
    
    super.setDirectory(uri, entries);
    
    // Cache metadata for entries if enabled
    if (this.mountConfig.cacheMetadata) {
      this.cacheEntriesMetadata(uri, entries);
    }
    
    // Prefetch directories if enabled
    if (this.mountConfig.prefetchDirectories) {
      this.prefetchDirectories(uri, entries, 0);
    }
  }
  
  /**
   * Cache metadata for directory entries
   * @param parentUri Parent directory URI
   * @param entries Directory entries
   */
  private cacheEntriesMetadata(parentUri: vscode.Uri, entries: [string, vscode.FileType][]): void {
    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.parse(parentUri.toString() + '/' + name);
      
      const metadata = {
        name,
        type,
        parentUri: parentUri.toString()
      };
      
      // Use a public method to get cache key or create our own
      const key = this.createCacheKey(entryUri);
      this.metadataCache.set(key, {
        metadata,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Create a cache key for a URI
   * @param uri The URI to create a key for
   * @returns Cache key
   */
  private createCacheKey(uri: vscode.Uri): string {
    const mountId = this.getMountIdFromUri(uri);
    if (!mountId) {
      return uri.toString();
    }
    return `${mountId}:${uri.path}`;
  }
  
  /**
   * Check if a cache entry is still valid
   * @param timestamp The timestamp to check
   * @returns True if the entry is still valid
   */
  private isEntryValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.mountConfig.metadataCacheTimeout;
  }
  
  /**
   * Prefetch directories for better browsing experience
   * @param parentUri Parent directory URI
   * @param entries Directory entries
   * @param currentDepth Current prefetch depth
   */
  private prefetchDirectories(
    parentUri: vscode.Uri, 
    entries: [string, vscode.FileType][], 
    currentDepth: number
  ): void {
    // Stop if we've reached the maximum prefetch depth
    if (currentDepth >= this.mountConfig.prefetchDepth) {
      return;
    }
    
    // We don't actually fetch the directories here, as that would require
    // making network requests. Instead, we just mark that we would prefetch
    // these directories when implementing the actual file system provider.
    const directoryEntries = entries.filter(([_, type]) => type === vscode.FileType.Directory);
    
    if (directoryEntries.length > 0) {
      this.mountStats.prefetchCount += directoryEntries.length;
      
      // In a real implementation, we would queue these directories for prefetching
      // console.log(`Would prefetch ${directoryEntries.length} directories under ${parentUri}`);
    }
  }
  
  /**
   * Get file content from cache or return null if not found
   * Override to check mount-specific caching settings
   * @param uri The URI of the file
   * @returns File content or null if not in cache
   */
  override getContent(uri: vscode.Uri): Uint8Array | null {
    if (!this.isCachingEnabled(uri)) {
      return null;
    }
    return super.getContent(uri);
  }
  
  /**
   * Store file content in cache
   * Override to check mount-specific caching settings
   * @param uri The URI of the file
   * @param content The file content to cache
   */
  override setContent(uri: vscode.Uri, content: Uint8Array): void {
    if (!this.isCachingEnabled(uri)) {
      return;
    }
    super.setContent(uri, content);
  }
  
  /**
   * Get metadata for a file or directory
   * @param uri The URI to get metadata for
   * @returns Metadata or null if not in cache
   */
  getMetadata(uri: vscode.Uri): any | null {
    if (!this.isCachingEnabled(uri) || !this.mountConfig.cacheMetadata) {
      return null;
    }
    
    const key = this.createCacheKey(uri);
    const entry = this.metadataCache.get(key);
    
    if (entry && this.isEntryValid(entry.timestamp)) {
      this.mountStats.metadataHits++;
      return entry.metadata;
    }
    
    if (entry) {
      this.metadataCache.delete(key);
    }
    
    this.mountStats.metadataMisses++;
    return null;
  }
  
  /**
   * Store metadata in cache
   * @param uri The URI of the file or directory
   * @param metadata The metadata to cache
   */
  setMetadata(uri: vscode.Uri, metadata: any): void {
    if (!this.isCachingEnabled(uri) || !this.mountConfig.cacheMetadata) {
      return;
    }
    
    const key = this.createCacheKey(uri);
    this.metadataCache.set(key, {
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Invalidate cache entry for a URI
   * Override to implement hierarchical invalidation
   * @param uri The URI to invalidate
   */
  override invalidate(uri: vscode.Uri): void {
    super.invalidate(uri);
    
    const key = this.createCacheKey(uri);
    this.metadataCache.delete(key);
    
    // If hierarchical caching is enabled, invalidate child entries
    if (this.mountConfig.hierarchicalCaching) {
      this.invalidateHierarchy(uri);
    }
  }
  
  /**
   * Invalidate all cache entries for a mount
   * @param mountId The mount ID to invalidate
   */
  invalidateMount(mountId: string): void {
    // Remove all entries for this mount
    const mountPrefix = `${mountId}:`;
    
    for (const [key] of this.metadataCache.entries()) {
      if (key.startsWith(mountPrefix)) {
        this.metadataCache.delete(key);
      }
    }
    
    // Use the parent class method to invalidate other caches
    this.invalidateConnection(mountId);
  }
  
  /**
   * Invalidate all child entries in the cache hierarchy
   * @param uri The parent URI to invalidate children for
   */
  private invalidateHierarchy(uri: vscode.Uri): void {
    const parentKey = this.createCacheKey(uri);
    const parentPrefix = `${parentKey}/`;
    
    // Invalidate metadata cache
    for (const [key] of this.metadataCache.entries()) {
      if (key.startsWith(parentPrefix)) {
        this.metadataCache.delete(key);
        this.mountStats.hierarchicalInvalidations++;
      }
    }
    
    // Invalidate stat cache (using protected method from parent)
    for (const [key] of (this as any).statCache.entries()) {
      if (key.startsWith(parentPrefix)) {
        (this as any).statCache.delete(key);
        this.mountStats.hierarchicalInvalidations++;
      }
    }
    
    // Invalidate directory cache (using protected method from parent)
    for (const [key] of (this as any).directoryCache.entries()) {
      if (key.startsWith(parentPrefix)) {
        (this as any).directoryCache.delete(key);
        this.mountStats.hierarchicalInvalidations++;
      }
    }
    
    // Invalidate content cache (using protected method from parent)
    for (const [key] of (this as any).contentCache.entries()) {
      if (key.startsWith(parentPrefix)) {
        (this as any).contentCache.delete(key);
        this.mountStats.hierarchicalInvalidations++;
      }
    }
  }
  
  /**
   * Get extended cache statistics including mount-specific stats
   * @returns Extended cache statistics
   */
  override getStats(): any {
    const baseStats = super.getStats();
    
    const metadataTotal = this.mountStats.metadataHits + this.mountStats.metadataMisses;
    
    return {
      ...baseStats,
      ...this.mountStats,
      metadataHitRate: metadataTotal > 0 ? this.mountStats.metadataHits / metadataTotal : 0,
      mountPointCount: this.mountPoints.size
    };
  }
  
  /**
   * Clear all caches
   * Override to also clear mount-specific caches
   */
  override clear(): void {
    super.clear();
    this.metadataCache.clear();
    this.mountStats = {
      prefetchCount: 0,
      metadataHits: 0,
      metadataMisses: 0,
      hierarchicalInvalidations: 0
    };
  }
}