import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileSystemCacheManager, DefaultCacheConfig } from './file-system-cache-manager';

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
      parse: (value: string) => ({
        scheme: 'ssh',
        authority: value.split('://')[1]?.split('/')[0] || '',
        path: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        query: '',
        fragment: '',
        fsPath: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        with: vi.fn().mockImplementation((params: any) => {
          const parsedValue = typeof value === 'string' ? value : '';
          return {
            scheme: 'ssh',
            authority: parsedValue.split('://')[1]?.split('/')[0] || '',
            path: params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || '',
            query: '',
            fragment: '',
            fsPath: params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || '',
            with: vi.fn(),
            toString: vi.fn().mockReturnValue(`ssh://${parsedValue.split('://')[1]?.split('/')[0] || ''}${params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || ''}`),
            toJSON: vi.fn()
          };
        }),
        toString: vi.fn().mockReturnValue(value),
        toJSON: vi.fn()
      })
    }
  };
});

// Import after mocking
import * as vscode from 'vscode';

// Helper function to create mock URIs
const mockUri = (connectionId: string, path: string): vscode.Uri => {
  return {
    scheme: 'ssh',
    authority: connectionId,
    path,
    query: '',
    fragment: '',
    fsPath: path,
    with: vi.fn().mockImplementation((params: any) => {
      return {
        scheme: 'ssh',
        authority: connectionId,
        path: params.path || path,
        query: '',
        fragment: '',
        fsPath: params.path || path,
        with: vi.fn().mockImplementation((newParams: any) => {
          return {
            scheme: 'ssh',
            authority: connectionId,
            path: newParams.path || params.path || path,
            query: '',
            fragment: '',
            fsPath: newParams.path || params.path || path,
            with: vi.fn().mockImplementation(() => { return this; }),
            toString: vi.fn().mockReturnValue(`ssh://${connectionId}${newParams.path || params.path || path}`),
            toJSON: vi.fn()
          };
        }),
        toString: vi.fn().mockReturnValue(`ssh://${connectionId}${params.path || path}`),
        toJSON: vi.fn()
      };
    }),
    toString: vi.fn().mockReturnValue(`ssh://${connectionId}${path}`),
    toJSON: vi.fn()
  } as vscode.Uri;
};

describe('FileSystemCacheManager', () => {
  let cacheManager: FileSystemCacheManager;
  
  beforeEach(() => {
    // Create a new cache manager with a short max age for testing
    cacheManager = new FileSystemCacheManager({
      ...DefaultCacheConfig,
      maxAge: 100 // 100ms for faster testing
    });
    
    // Reset the timer mocks before each test
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  describe('stat caching', () => {
    it('should cache and retrieve file stats', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // Set the stat in cache
      cacheManager.setStat(uri, stat);
      
      // Get the stat from cache
      const cachedStat = cacheManager.getStat(uri);
      
      // Verify the cached stat matches the original
      expect(cachedStat).toEqual(stat);
    });
    
    it('should return null for expired stat cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // Set the stat in cache
      cacheManager.setStat(uri, stat);
      
      // Advance time beyond the cache max age
      vi.advanceTimersByTime(200);
      
      // Get the stat from cache
      const cachedStat = cacheManager.getStat(uri);
      
      // Verify the cached stat is null (expired)
      expect(cachedStat).toBeNull();
    });
    
    it('should invalidate stat cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // Set the stat in cache
      cacheManager.setStat(uri, stat);
      
      // Invalidate the cache entry
      cacheManager.invalidate(uri);
      
      // Get the stat from cache
      const cachedStat = cacheManager.getStat(uri);
      
      // Verify the cached stat is null (invalidated)
      expect(cachedStat).toBeNull();
    });
  });
  
  describe('directory caching', () => {
    it('should cache and retrieve directory listings', () => {
      const uri = mockUri('test-connection', '/path/to/directory');
      const entries: [string, vscode.FileType][] = [
        ['file1.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory],
        ['symlink', vscode.FileType.SymbolicLink]
      ];
      
      // Set the directory listing in cache
      cacheManager.setDirectory(uri, entries);
      
      // Get the directory listing from cache
      const cachedEntries = cacheManager.getDirectory(uri);
      
      // Verify the cached entries match the original
      expect(cachedEntries).toEqual(entries);
    });
    
    it('should return null for expired directory cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/directory');
      const entries: [string, vscode.FileType][] = [
        ['file1.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory]
      ];
      
      // Set the directory listing in cache
      cacheManager.setDirectory(uri, entries);
      
      // Advance time beyond the cache max age
      vi.advanceTimersByTime(200);
      
      // Get the directory listing from cache
      const cachedEntries = cacheManager.getDirectory(uri);
      
      // Verify the cached entries are null (expired)
      expect(cachedEntries).toBeNull();
    });
    
    it('should invalidate directory cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/directory');
      const entries: [string, vscode.FileType][] = [
        ['file1.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory]
      ];
      
      // Set the directory listing in cache
      cacheManager.setDirectory(uri, entries);
      
      // Invalidate the cache entry
      cacheManager.invalidate(uri);
      
      // Get the directory listing from cache
      const cachedEntries = cacheManager.getDirectory(uri);
      
      // Verify the cached entries are null (invalidated)
      expect(cachedEntries).toBeNull();
    });
    
    it('should invalidate parent directory cache when a file is modified', () => {
      const dirUri = mockUri('test-connection', '/path/to/directory');
      const fileUri = mockUri('test-connection', '/path/to/directory/file.txt');
      
      const entries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory]
      ];
      
      // Set the directory listing in cache
      cacheManager.setDirectory(dirUri, entries);
      
      // Invalidate the file (which should also invalidate the parent directory)
      cacheManager.invalidate(fileUri);
      
      // Get the directory listing from cache
      const cachedEntries = cacheManager.getDirectory(dirUri);
      
      // Verify the cached entries are null (invalidated)
      expect(cachedEntries).toBeNull();
    });
  });
  
  describe('content caching', () => {
    it('should cache and retrieve file contents', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Set the content in cache
      cacheManager.setContent(uri, content);
      
      // Get the content from cache
      const cachedContent = cacheManager.getContent(uri);
      
      // Verify the cached content matches the original
      expect(cachedContent).toEqual(content);
    });
    
    it('should return null for expired content cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Set the content in cache
      cacheManager.setContent(uri, content);
      
      // Advance time beyond the cache max age
      vi.advanceTimersByTime(200);
      
      // Get the content from cache
      const cachedContent = cacheManager.getContent(uri);
      
      // Verify the cached content is null (expired)
      expect(cachedContent).toBeNull();
    });
    
    it('should invalidate content cache entries', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Set the content in cache
      cacheManager.setContent(uri, content);
      
      // Invalidate the cache entry
      cacheManager.invalidate(uri);
      
      // Get the content from cache
      const cachedContent = cacheManager.getContent(uri);
      
      // Verify the cached content is null (invalidated)
      expect(cachedContent).toBeNull();
    });
    
    it('should not cache content larger than maxContentSize', () => {
      const uri = mockUri('test-connection', '/path/to/large-file.txt');
      
      // Create a content buffer larger than the default max size
      const largeContent = new Uint8Array(DefaultCacheConfig.maxContentSize + 1);
      
      // Set the content in cache
      cacheManager.setContent(uri, largeContent);
      
      // Get the content from cache
      const cachedContent = cacheManager.getContent(uri);
      
      // Verify the content was not cached
      expect(cachedContent).toBeNull();
    });
  });
  
  describe('connection invalidation', () => {
    it('should invalidate all cache entries for a connection', () => {
      const conn1FileUri = mockUri('connection-1', '/path/to/file1.txt');
      const conn1DirUri = mockUri('connection-1', '/path/to/dir');
      const conn2FileUri = mockUri('connection-2', '/path/to/file2.txt');
      
      const fileStat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      const dirEntries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File]
      ];
      
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Set cache entries for both connections
      cacheManager.setStat(conn1FileUri, fileStat);
      cacheManager.setDirectory(conn1DirUri, dirEntries);
      cacheManager.setContent(conn1FileUri, content);
      cacheManager.setStat(conn2FileUri, fileStat);
      
      // Invalidate all entries for connection-1
      cacheManager.invalidateConnection('connection-1');
      
      // Verify connection-1 entries are invalidated
      expect(cacheManager.getStat(conn1FileUri)).toBeNull();
      expect(cacheManager.getDirectory(conn1DirUri)).toBeNull();
      expect(cacheManager.getContent(conn1FileUri)).toBeNull();
      
      // Verify connection-2 entries are still valid
      expect(cacheManager.getStat(conn2FileUri)).toEqual(fileStat);
    });
  });
  
  describe('cache statistics', () => {
    it('should track cache hit and miss statistics', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // First access should be a miss
      expect(cacheManager.getStat(uri)).toBeNull();
      
      // Set the stat in cache
      cacheManager.setStat(uri, stat);
      
      // Second access should be a hit
      expect(cacheManager.getStat(uri)).toEqual(stat);
      
      // Get the stats
      const stats = cacheManager.getStats();
      
      // Verify the stats
      expect(stats.statHits).toBe(1);
      expect(stats.statMisses).toBe(1);
      expect(stats.statHitRate).toBeCloseTo(0.5);
    });
  });
  
  describe('cache capacity management', () => {
    it('should evict entries when capacity is exceeded', () => {
      // Create a cache manager with a small capacity
      const smallCacheManager = new FileSystemCacheManager({
        ...DefaultCacheConfig,
        maxEntries: 2
      });
      
      const uri1 = mockUri('test-connection', '/path/to/file1.txt');
      const uri2 = mockUri('test-connection', '/path/to/file2.txt');
      const uri3 = mockUri('test-connection', '/path/to/file3.txt');
      
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      // Add three entries to a cache with capacity of 2
      smallCacheManager.setStat(uri1, stat);
      smallCacheManager.setStat(uri2, stat);
      smallCacheManager.setStat(uri3, stat);
      
      // Get the stats
      const stats = smallCacheManager.getStats();
      
      // Verify at least one eviction occurred
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });
  
  describe('cache clearing', () => {
    it('should clear all cache entries', () => {
      const uri1 = mockUri('test-connection', '/path/to/file1.txt');
      const uri2 = mockUri('test-connection', '/path/to/directory');
      
      const stat: vscode.FileStat = {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 1024
      };
      
      const entries: [string, vscode.FileType][] = [
        ['file.txt', vscode.FileType.File]
      ];
      
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Set cache entries
      cacheManager.setStat(uri1, stat);
      cacheManager.setDirectory(uri2, entries);
      cacheManager.setContent(uri1, content);
      
      // Clear the cache
      cacheManager.clear();
      
      // Verify all entries are cleared
      expect(cacheManager.getStat(uri1)).toBeNull();
      expect(cacheManager.getDirectory(uri2)).toBeNull();
      expect(cacheManager.getContent(uri1)).toBeNull();
      
      // Verify stats are reset
      const stats = cacheManager.getStats();
      expect(stats.statHits).toBe(0);
      expect(stats.statMisses).toBe(1); // The get above for uri1
      expect(stats.evictions).toBe(0);
    });
  });
});