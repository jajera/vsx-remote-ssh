import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RemoteFileCache } from '../../src/ssh/remote-file-cache';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('RemoteFileCache', () => {
  let cache: RemoteFileCache;
  const mockConfig = {
    maxSize: 1024 * 1024, // 1MB
    maxAge: 30 * 60 * 1000, // 30 minutes
    cacheDir: '/tmp/test-cache',
    enableCompression: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(false);
    cache = new RemoteFileCache(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create cache directory if it does not exist', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(mockConfig.cacheDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockConfig.cacheDir, { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks();
      (fs.existsSync as any).mockReturnValue(true);
      new RemoteFileCache(mockConfig);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    it('should return null for non-existent file', async () => {
      const result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toBeNull();
    });

    it('should return cached file if valid', async () => {
      const mockFile = {
        path: '/test/file.txt',
        content: Buffer.from('test content'),
        metadata: {
          mode: 0o644,
          uid: 1000,
          gid: 1000,
          size: 12,
          atime: new Date(),
          mtime: new Date(),
          ctime: new Date()
        },
        lastAccessed: new Date(),
        lastModified: new Date(),
        size: 12,
        isDirectory: false
      };

      // Mock the cache to return a valid file
      (cache as any).cache.set('conn1:/test/file.txt', mockFile);

      const result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toEqual(mockFile);
    });

    it('should return null for expired file', async () => {
      const mockFile = {
        path: '/test/file.txt',
        content: Buffer.from('test content'),
        metadata: {
          mode: 0o644,
          uid: 1000,
          gid: 1000,
          size: 12,
          atime: new Date(),
          mtime: new Date(),
          ctime: new Date()
        },
        lastAccessed: new Date(),
        lastModified: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        size: 12,
        isDirectory: false
      };

      (cache as any).cache.set('conn1:/test/file.txt', mockFile);

      const result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toBeNull();
    });
  });

  describe('setFile', () => {
    it('should store file in cache', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      await cache.setFile('conn1', '/test/file.txt', content, metadata);

      const result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toBeDefined();
      expect(result?.content).toEqual(content);
      expect(result?.metadata).toEqual(metadata);
    });

    it('should persist file to disk', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      await cache.setFile('conn1', '/test/file.txt', content, metadata);

      expect(fs.promises.writeFile).toHaveBeenCalled();
    });

    it('should evict old files when cache is full', async () => {
      // Set a small max size
      const smallCache = new RemoteFileCache({
        ...mockConfig,
        maxSize: 50 // 50 bytes - smaller than file size to force eviction
      });

      const content = Buffer.from('a'.repeat(50)); // 50 bytes
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 50,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      // Add first file
      await smallCache.setFile('conn1', '/file1.txt', content, metadata);
      
      // Add second file (should trigger eviction)
      await smallCache.setFile('conn1', '/file2.txt', content, metadata);

      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('invalidateFile', () => {
    it('should remove file from cache', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      await cache.setFile('conn1', '/test/file.txt', content, metadata);
      
      // Verify file is cached
      let result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toBeDefined();

      // Invalidate file
      await cache.invalidateFile('conn1', '/test/file.txt');
      
      // Verify file is removed
      result = await cache.getFile('conn1', '/test/file.txt');
      expect(result).toBeNull();
    });

    it('should remove file from disk', async () => {
      await cache.invalidateFile('conn1', '/test/file.txt');
      expect(fs.promises.unlink).toHaveBeenCalled();
    });
  });

  describe('invalidateDirectory', () => {
    it('should remove all files in directory', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      // Add files in directory
      await cache.setFile('conn1', '/test/file1.txt', content, metadata);
      await cache.setFile('conn1', '/test/file2.txt', content, metadata);
      await cache.setFile('conn1', '/other/file.txt', content, metadata);

      // Invalidate directory
      await cache.invalidateDirectory('conn1', '/test');

      // Verify files in directory are removed
      expect(await cache.getFile('conn1', '/test/file1.txt')).toBeNull();
      expect(await cache.getFile('conn1', '/test/file2.txt')).toBeNull();
      
      // Verify file outside directory is still there
      expect(await cache.getFile('conn1', '/other/file.txt')).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should remove all cached files', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      await cache.setFile('conn1', '/file1.txt', content, metadata);
      await cache.setFile('conn1', '/file2.txt', content, metadata);

      await cache.clearCache();

      expect(await cache.getFile('conn1', '/file1.txt')).toBeNull();
      expect(await cache.getFile('conn1', '/file2.txt')).toBeNull();
    });

    it('should reset statistics', async () => {
      const stats1 = cache.getStats();
      expect(stats1.totalFiles).toBe(0);

      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      await cache.setFile('conn1', '/file.txt', content, metadata);
      await cache.getFile('conn1', '/file.txt'); // Generate some stats

      await cache.clearCache();

      const stats2 = cache.getStats();
      expect(stats2.totalFiles).toBe(0);
      expect(stats2.hitRate).toBe(0);
      expect(stats2.missRate).toBe(0);
      expect(stats2.evictions).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const content = Buffer.from('test content');
      const metadata = {
        mode: 0o644,
        uid: 1000,
        gid: 1000,
        size: 12,
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date()
      };

      // Add some files
      await cache.setFile('conn1', '/file1.txt', content, metadata);
      await cache.setFile('conn1', '/file2.txt', content, metadata);

      // Generate some hits and misses
      await cache.getFile('conn1', '/file1.txt'); // hit
      await cache.getFile('conn1', '/file2.txt'); // hit
      await cache.getFile('conn1', '/nonexistent.txt'); // miss

      const stats = cache.getStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSize).toBe(24); // 2 files * 12 bytes
      expect(stats.hitRate).toBe(2/3); // 2 hits out of 3 requests
      expect(stats.missRate).toBe(1/3); // 1 miss out of 3 requests
    });
  });

  describe('loadFromDisk', () => {
    it('should load cached files from disk', async () => {
      const mockFiles = ['file1.json', 'file2.json'];
      const mockFileData = {
        path: '/test/file.txt',
        content: Buffer.from('test content').toString('base64'),
        metadata: {
          mode: 0o644,
          uid: 1000,
          gid: 1000,
          size: 12,
          atime: new Date().toISOString(),
          mtime: new Date().toISOString(),
          ctime: new Date().toISOString()
        },
        lastAccessed: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        size: 12,
        isDirectory: false
      };

      (fs.promises.readdir as any).mockResolvedValue(mockFiles);
      (fs.promises.readFile as any).mockResolvedValue(JSON.stringify(mockFileData));

      await cache.loadFromDisk();

      const stats = cache.getStats();
      expect(stats.totalFiles).toBe(2);
    });

    it('should handle corrupted cache files gracefully', async () => {
      const mockFiles = ['file1.json', 'corrupted.json'];
      
      (fs.promises.readdir as any).mockResolvedValue(mockFiles);
      (fs.promises.readFile as any)
        .mockResolvedValueOnce(JSON.stringify({
          path: '/test/file.txt',
          content: Buffer.from('test content').toString('base64'),
          metadata: {
            mode: 0o644,
            uid: 1000,
            gid: 1000,
            size: 12,
            atime: new Date().toISOString(),
            mtime: new Date().toISOString(),
            ctime: new Date().toISOString()
          },
          lastAccessed: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          size: 12,
          isDirectory: false
        }))
        .mockRejectedValueOnce(new Error('Invalid JSON'));

      // Should not throw
      await cache.loadFromDisk();

      const stats = cache.getStats();
      expect(stats.totalFiles).toBe(1); // Only valid file loaded
    });
  });
}); 