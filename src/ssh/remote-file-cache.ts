import * as fs from 'fs';
import * as path from 'path';
import { SSHConnection } from '../interfaces/ssh';

export interface CachedFile {
  path: string;
  content: Buffer;
  metadata: FileMetadata;
  lastAccessed: Date;
  lastModified: Date;
  size: number;
  isDirectory: boolean;
}

export interface FileMetadata {
  mode: number;
  uid: number;
  gid: number;
  size: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
}

export interface CacheConfig {
  maxSize: number; // in bytes
  maxAge: number; // in milliseconds
  cacheDir: string;
  enableCompression: boolean;
}

export interface CacheStats {
  totalFiles: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
}

export class RemoteFileCache {
  private cache: Map<string, CachedFile> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0
  };
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
    this.ensureCacheDirectory();
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.config.cacheDir)) {
      fs.mkdirSync(this.config.cacheDir, { recursive: true });
    }
  }

  async getFile(connectionId: string, filePath: string): Promise<CachedFile | null> {
    const cacheKey = this.getCacheKey(connectionId, filePath);
    this.stats.totalRequests++;

    const cached = this.cache.get(cacheKey);
    if (cached && this.isValid(cached)) {
      this.stats.hits++;
      cached.lastAccessed = new Date();
      return cached;
    }

    if (cached) {
      this.cache.delete(cacheKey);
      this.stats.evictions++;
    }

    this.stats.misses++;
    return null;
  }

  async setFile(connectionId: string, filePath: string, content: Buffer, metadata: FileMetadata): Promise<void> {
    const cacheKey = this.getCacheKey(connectionId, filePath);
    
    const cachedFile: CachedFile = {
      path: filePath,
      content: this.config.enableCompression ? await this.compress(content) : content,
      metadata,
      lastAccessed: new Date(),
      lastModified: new Date(),
      size: content.length,
      isDirectory: metadata.mode & 0o40000 ? true : false
    };

    // Check if we need to evict entries
    await this.ensureCapacity(cachedFile.size);

    this.cache.set(cacheKey, cachedFile);
    await this.persistToDisk(cacheKey, cachedFile);
  }

  async invalidateFile(connectionId: string, filePath: string): Promise<void> {
    const cacheKey = this.getCacheKey(connectionId, filePath);
    this.cache.delete(cacheKey);
    await this.removeFromDisk(cacheKey);
  }

  async invalidateDirectory(connectionId: string, dirPath: string): Promise<void> {
    const prefix = this.getCacheKey(connectionId, dirPath);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      await this.removeFromDisk(key);
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
    await this.clearDiskCache();
  }

  getStats(): CacheStats {
    const totalSize = Array.from(this.cache.values()).reduce((sum, file) => sum + file.size, 0);
    const hitRate = this.stats.totalRequests > 0 ? this.stats.hits / this.stats.totalRequests : 0;
    const missRate = this.stats.totalRequests > 0 ? this.stats.misses / this.stats.totalRequests : 0;

    return {
      totalFiles: this.cache.size,
      totalSize,
      hitRate,
      missRate,
      evictions: this.stats.evictions
    };
  }

  private getCacheKey(connectionId: string, filePath: string): string {
    return `${connectionId}:${filePath}`;
  }

  private isValid(cachedFile: CachedFile): boolean {
    const now = new Date();
    const age = now.getTime() - cachedFile.lastModified.getTime();
    return age < this.config.maxAge;
  }

  private async ensureCapacity(newFileSize: number): Promise<void> {
    const currentSize = Array.from(this.cache.values()).reduce((sum, file) => sum + file.size, 0);
    
    if (currentSize + newFileSize <= this.config.maxSize) {
      return;
    }

    // Sort by last accessed time (LRU)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    let freedSize = 0;
    const keysToRemove: string[] = [];

    for (const [key, file] of entries) {
      if (currentSize - freedSize + newFileSize <= this.config.maxSize) {
        break;
      }
      keysToRemove.push(key);
      freedSize += file.size;
    }

    for (const key of keysToRemove) {
      this.cache.delete(key);
      await this.removeFromDisk(key);
      this.stats.evictions++;
    }
  }

  private async compress(data: Buffer): Promise<Buffer> {
    // Simple compression - in a real implementation, you'd use zlib
    return data;
  }

  private async decompress(data: Buffer): Promise<Buffer> {
    // Simple decompression - in a real implementation, you'd use zlib
    return data;
  }

  private async persistToDisk(cacheKey: string, cachedFile: CachedFile): Promise<void> {
    const filePath = path.join(this.config.cacheDir, this.sanitizeFileName(cacheKey));
    const data = JSON.stringify(cachedFile);
    await fs.promises.writeFile(filePath, data);
  }

  private async removeFromDisk(cacheKey: string): Promise<void> {
    const filePath = path.join(this.config.cacheDir, this.sanitizeFileName(cacheKey));
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // File might not exist, ignore
    }
  }

  private async clearDiskCache(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.config.cacheDir);
      for (const file of files) {
        await fs.promises.unlink(path.join(this.config.cacheDir, file));
      }
    } catch (error) {
      // Directory might not exist, ignore
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  async loadFromDisk(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.config.cacheDir);
      for (const file of files) {
        try {
          const filePath = path.join(this.config.cacheDir, file);
          const data = await fs.promises.readFile(filePath, 'utf8');
          const cachedFile: CachedFile = JSON.parse(data);
          
          // Restore dates
          cachedFile.lastAccessed = new Date(cachedFile.lastAccessed);
          cachedFile.lastModified = new Date(cachedFile.lastModified);
          cachedFile.metadata.atime = new Date(cachedFile.metadata.atime);
          cachedFile.metadata.mtime = new Date(cachedFile.metadata.mtime);
          cachedFile.metadata.ctime = new Date(cachedFile.metadata.ctime);
          
          // Convert content back to Buffer
          if (typeof cachedFile.content === 'string') {
            cachedFile.content = Buffer.from(cachedFile.content, 'base64');
          }
          
          const cacheKey = this.desanitizeFileName(file);
          this.cache.set(cacheKey, cachedFile);
        } catch (error) {
          // Skip corrupted cache files
          console.warn(`Failed to load cache file ${file}:`, error);
        }
      }
    } catch (error) {
      // Cache directory might not exist, ignore
    }
  }

  private desanitizeFileName(fileName: string): string {
    // This is a simplified version - in practice you'd need a more robust mapping
    return fileName.replace(/_/g, ':');
  }
} 