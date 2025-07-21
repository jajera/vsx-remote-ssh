import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MountCacheManager, DefaultMountCacheConfig } from './mount-cache-manager';
import { MountPoint, MountStatus, MountOptions } from '../interfaces/mount';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64
    },
    Uri: {
      parse: (value: string) => {
        const scheme = value.split('://')[0] || 'ssh';
        const authority = value.split('://')[1]?.split('/')[0] || '';
        const pathParts = value.split('://')[1]?.split('/').slice(1) || [];
        const pathStr = '/' + pathParts.join('/');
        
        return {
          scheme,
          authority,
          path: pathStr,
          query: '',
          fragment: '',
          fsPath: pathStr,
          with: vi.fn().mockImplementation((params: any) => {
            return {
              scheme: params.scheme || scheme,
              authority: params.authority || authority,
              path: params.path || pathStr,
              query: params.query || '',
              fragment: params.fragment || '',
              fsPath: params.path || pathStr,
              with: vi.fn(),
              toString: vi.fn().mockReturnValue(`${params.scheme || scheme}://${params.authority || authority}${params.path || pathStr}`),
              toJSON: vi.fn()
            };
          }),
          toString: vi.fn().mockReturnValue(value),
          toJSON: vi.fn()
        };
      }
    }
  };
});

// Import after mocking
import * as vscode from 'vscode';

// Helper function to create mock URIs
const mockUri = (scheme: string, authority: string, path: string): vscode.Uri => {
  return vscode.Uri.parse(`${scheme}://${authority}${path}`);
};

// Helper function to create mock mount points
const createMockMountPoint = (id: string, connectionId: string, remotePath: string, cacheEnabled = true): MountPoint => ({
  id,
  connectionId,
  remotePath,
  displayName: `Mount ${id}`,
  uri: mockUri('ssh-mount', id, '/'),
  status: MountStatus.Connected,
  lastConnected: new Date(),
  options: {
    autoReconnect: true,
    cacheEnabled,
    watchEnabled: true,
    watchExcludePatterns: []
  }
});

describe('MountCacheManager', () => {
  let cacheManager: MountCacheManager;
  
  beforeEach(() => {
    // Create a new cache manager with a short max age for testing
    cacheManager = new MountCacheManager({
      ...DefaultMountCacheConfig,
      maxAge: 100, // 100ms for faster testing
      metadataCacheTimeout: 100 // 100ms for faster testing
    });
    
    // Reset the timer mocks before each test
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  describe('mount point management', () => {
    it('should register and retrieve mount points', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      
      cacheManager.registerMountPoint(mountPoint);
      
      const result = cacheManager.getMountPoint('mount1');
      
      expect(result).toEqual(mountPoint);
    });
    
    it('should unregister mount points', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      
      cacheManager.registerMountPoint(mountPoint);
      cacheManager.unregisterMountPoint('mount1');
      
      const result = cacheManager.getMountPoint('mount1');
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('mount-specific caching', () => {
    it('should respect mount-specific cache settings', () => {
      // Create mount points with different cache settings
      const enabledMount = createMockMountPoint('enabled-mount', 'conn1', '/home/user/enabled', true);
      const disabledMount = createMockMountPoint('disabled-mount', 'conn1', '/home/user/disabled', false);
      
      cacheManager.registerMountPoint(enabledMount);
      cacheManager.registerMountPoint(disabledMount);
      
      const enabledUri = mockUri('ssh-mount', 'enabled-mount', '/file.txt');
      const disabledUri = mockUri('ssh-mount', 'disabled-mount', '/file.txt');
      
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // Set stats in cache
      cacheManager.setStat(enabledUri, stat);
      cacheManager.setStat(disabledUri, stat);
      
      // Get stats from cache
      const enabledStat = cacheManager.getStat(enabledUri);
      const disabledStat = cacheManager.getStat(disabledUri);
      
      // Verify that caching works for enabled mount but not for disabled mount
      expect(enabledStat).toEqual(stat);
      expect(disabledStat).toBeNull();
    });
  });
  
  describe('metadata caching', () => {
    it('should cache and retrieve metadata', () => {
      const uri = mockUri('ssh-mount', 'mount1', '/file.txt');
      const metadata = { lastAccessed: Date.now(), owner: 'user', permissions: '644' };
      
      // Set metadata in cache
      cacheManager.setMetadata(uri, metadata);
      
      // Get metadata from cache
      const cachedMetadata = cacheManager.getMetadata(uri);
      
      // Verify the cached metadata matches the original
      expect(cachedMetadata).toEqual(metadata);
    });
    
    it('should return null for expired metadata cache entries', () => {
      const uri = mockUri('ssh-mount', 'mount1', '/file.txt');
      const metadata = { lastAccessed: Date.now(), owner: 'user', permissions: '644' };
      
      // Set metadata in cache
      cacheManager.setMetadata(uri, metadata);
      
      // Advance time beyond the cache max age
      vi.advanceTimersByTime(200);
      
      // Get metadata from cache
      const cachedMetadata = cacheManager.getMetadata(uri);
      
      // Verify the cached metadata is null (expired)
      expect(cachedMetadata).toBeNull();
    });
    
    it('should invalidate metadata cache entries', () => {
      const uri = mockUri('ssh-mount', 'mount1', '/file.txt');
      const metadata = { lastAccessed: Date.now(), owner: 'user', permissions: '644' };
      
      // Set metadata in cache
      cacheManager.setMetadata(uri, metadata);
      
      // Invalidate the cache entry
      cacheManager.invalidate(uri);
      
      // Get metadata from cache
      const cachedMetadata = cacheManager.getMetadata(uri);
      
      // Verify the cached metadata is null (invalidated)
      expect(cachedMetadata).toBeNull();
    });
  });
  
  describe('directory entry metadata caching', () => {
    it('should cache metadata for directory entries', () => {
      const dirUri = mockUri('ssh-mount', 'mount1', '/dir');
      const entries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory]
      ];
      
      // Register mount point
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      cacheManager.registerMountPoint(mountPoint);
      
      // Set directory in cache
      cacheManager.setDirectory(dirUri, entries);
      
      // Get metadata for a file in the directory
      const fileUri = mockUri('ssh-mount', 'mount1', '/dir/file.txt');
      const metadata = cacheManager.getMetadata(fileUri);
      
      // Verify metadata was cached
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('file.txt');
      expect(metadata.type).toBe(vscode.FileType.File);
    });
  });
  
  describe('hierarchical invalidation', () => {
    it('should invalidate child entries when parent is invalidated', () => {
      // Create a mount point
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      cacheManager.registerMountPoint(mountPoint);
      
      // Create parent and child URIs
      const parentUri = mockUri('ssh-mount', 'mount1', '/parent');
      const childUri = mockUri('ssh-mount', 'mount1', '/parent/child.txt');
      
      // Set entries in cache
      const parentStat: vscode.FileStat = {
        type: vscode.FileType.Directory,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0
      };
      
      const childStat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      cacheManager.setStat(parentUri, parentStat);
      cacheManager.setStat(childUri, childStat);
      cacheManager.setMetadata(childUri, { name: 'child.txt' });
      
      // Verify entries are in cache
      expect(cacheManager.getStat(parentUri)).toEqual(parentStat);
      expect(cacheManager.getStat(childUri)).toEqual(childStat);
      expect(cacheManager.getMetadata(childUri)).toBeDefined();
      
      // Invalidate parent
      cacheManager.invalidate(parentUri);
      
      // Verify parent and child entries are invalidated
      expect(cacheManager.getStat(parentUri)).toBeNull();
      expect(cacheManager.getStat(childUri)).toBeNull();
      expect(cacheManager.getMetadata(childUri)).toBeNull();
      
      // Verify hierarchical invalidation count
      const stats = cacheManager.getStats();
      expect(stats.hierarchicalInvalidations).toBeGreaterThan(0);
    });
  });
  
  describe('mount invalidation', () => {
    it('should invalidate all entries for a mount', () => {
      // Create a mount point
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      cacheManager.registerMountPoint(mountPoint);
      
      // Create URIs for the mount
      const fileUri = mockUri('ssh-mount', 'mount1', '/file.txt');
      const dirUri = mockUri('ssh-mount', 'mount1', '/dir');
      
      // Set entries in cache
      const fileStat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      const dirEntries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File]
      ];
      
      cacheManager.setStat(fileUri, fileStat);
      cacheManager.setDirectory(dirUri, dirEntries);
      cacheManager.setMetadata(fileUri, { name: 'file.txt' });
      
      // Verify entries are in cache
      expect(cacheManager.getStat(fileUri)).toEqual(fileStat);
      expect(cacheManager.getDirectory(dirUri)).toEqual(dirEntries);
      expect(cacheManager.getMetadata(fileUri)).toBeDefined();
      
      // Invalidate mount
      cacheManager.invalidateMount('mount1');
      
      // Verify all entries are invalidated
      expect(cacheManager.getStat(fileUri)).toBeNull();
      expect(cacheManager.getDirectory(dirUri)).toBeNull();
      expect(cacheManager.getMetadata(fileUri)).toBeNull();
    });
  });
  
  describe('cache statistics', () => {
    it('should track mount-specific cache statistics', () => {
      // Create a mount point
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      cacheManager.registerMountPoint(mountPoint);
      
      // Create URIs
      const dirUri = mockUri('ssh-mount', 'mount1', '/dir');
      const fileUri = mockUri('ssh-mount', 'mount1', '/dir/file.txt');
      
      // Set directory entries
      const entries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory]
      ];
      
      cacheManager.setDirectory(dirUri, entries);
      
      // Access metadata (first miss, then hit)
      expect(cacheManager.getMetadata(fileUri)).toBeDefined();
      expect(cacheManager.getMetadata(fileUri)).toBeDefined();
      
      // Get stats
      const stats = cacheManager.getStats();
      
      // Verify mount-specific stats
      expect(stats.metadataHits).toBeGreaterThan(0);
      expect(stats.metadataMisses).toBe(0); // Not a miss because it was populated by setDirectory
      expect(stats.prefetchCount).toBeGreaterThan(0); // Should have prefetched the subdir
      expect(stats.mountPointCount).toBe(1);
    });
  });
});